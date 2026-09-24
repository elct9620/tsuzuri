use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Where Detection looks, in order: `vendor/` in debug builds, the `PATH`, then the directories package managers install into.
pub fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = vendor_dirs();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    dirs.extend(package_manager_dirs());

    let mut unique = Vec::with_capacity(dirs.len());
    for dir in dirs {
        if !unique.contains(&dir) {
            unique.push(dir);
        }
    }
    unique
}

/// `vendor/<component>/bin` of this checkout; compiled into debug builds only, so a release never refers to it.
#[cfg(debug_assertions)]
fn vendor_dirs() -> Vec<PathBuf> {
    let vendor = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("vendor");
    std::fs::read_dir(vendor)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path().join("bin"))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(debug_assertions))]
fn vendor_dirs() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(unix)]
fn package_manager_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/run/current-system/sw/bin",
        "/nix/var/nix/profiles/default/bin",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        dirs.push(home.join(".nix-profile/bin"));
        dirs.push(home.join(".local/bin"));
    }
    if let Some(user) = std::env::var_os("USER") {
        dirs.push(Path::new("/etc/profiles/per-user").join(user).join("bin"));
    }
    dirs
}

#[cfg(windows)]
fn package_manager_dirs() -> Vec<PathBuf> {
    Vec::new()
}

/// The first `program` in `dirs` that exits successfully when run with `version_flag`.
pub fn detect(program: &str, version_flag: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    let file_name = format!("{program}{}", std::env::consts::EXE_SUFFIX);
    dirs.iter()
        .map(|dir| dir.join(&file_name))
        .find(|candidate| candidate.is_file() && runs(candidate, version_flag))
}

/// Whether the executable starts and answers its version flag with success.
pub fn runs(executable: &Path, version_flag: &str) -> bool {
    let mut command = Command::new(executable);
    command
        .arg(version_flag)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.status().is_ok_and(|status| status.success())
}
