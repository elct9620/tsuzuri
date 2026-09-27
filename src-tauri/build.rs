fn main() {
    embed_commit();
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !windows_msvc {
        tauri_build::build();
        return;
    }

    // Tauri's code imports comctl32 functions only Common Controls v6 exports, which a
    // binary reaches through its manifest. tauri-build embeds that manifest into the app
    // alone, so the unit-test binary would fail to load (STATUS_ENTRYPOINT_NOT_FOUND,
    // tauri-apps/tauri#13419). Handing the same manifest to the linker covers every
    // binary this package links, and tauri-build's copy is turned off so the app keeps one.
    let manifest =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

/// Names the commit being built as `TSUZURI_COMMIT`, or `unknown` outside a git checkout, and
/// builds again whenever HEAD moves to another commit.
fn embed_commit() {
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
    };
    let branch_ref = git(&["symbolic-ref", "-q", "HEAD"]);
    let watched_paths = ["HEAD", "packed-refs"]
        .into_iter()
        .chain(branch_ref.as_deref())
        .filter_map(|name| git(&["rev-parse", "--git-path", name]));
    // A missing path would count as changed on every build, so only existing ones are watched.
    for path in watched_paths.filter(|path| std::path::Path::new(path).exists()) {
        println!("cargo:rerun-if-changed={path}");
    }
    let commit = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=TSUZURI_COMMIT={commit}");
}
