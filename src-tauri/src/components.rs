pub mod detection;

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Manager};

const BUNDLED_DIR: &str = "components";
const CHOICES_FILE: &str = "components.json";

/// An executable Tsuzuri runs as a child process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Component {
    pub name: String,
    /// The executable's file name without extension, as package managers install it.
    pub program: String,
    /// A flag the executable answers with success, proving it runs.
    pub version_flag: String,
    pub install_hint: String,
}

fn component(name: &str, program: &str, version_flag: &str, install_hint: &str) -> Component {
    Component {
        name: name.to_string(),
        program: program.to_string(),
        version_flag: version_flag.to_string(),
        install_hint: install_hint.to_string(),
    }
}

/// Every Component, in the order a Mode runs them.
#[cfg(target_os = "macos")]
pub fn components() -> Vec<Component> {
    vec![
        component("ffmpeg", "ffmpeg", "-version", "brew install ffmpeg"),
        component(
            "whisper",
            "whisper-cli",
            "--version",
            "brew install whisper-cpp",
        ),
        component(
            "llama",
            "llama-server",
            "--version",
            "brew install llama.cpp",
        ),
    ]
}

/// Every Component, in the order a Mode runs them.
#[cfg(not(target_os = "macos"))]
pub fn components() -> Vec<Component> {
    vec![
        component(
            "ffmpeg",
            "ffmpeg",
            "-version",
            "install ffmpeg with your package manager",
        ),
        component(
            "whisper",
            "whisper-cli",
            "--version",
            "install whisper.cpp with your package manager",
        ),
        component(
            "llama",
            "llama-server",
            "--version",
            "install llama.cpp with your package manager",
        ),
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Chosen,
    Detected,
    Bundled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComponentStatus {
    name: String,
    ready: bool,
    path: Option<PathBuf>,
    origin: Option<Origin>,
    hint: Option<String>,
}

/// The executable the user chose for each Component, by Component name.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Choices(HashMap<String, PathBuf>);

impl Choices {
    /// Choices never saved load as none, so a first launch relies on Detection and the Bundled Variants.
    pub fn load(dir: &Path) -> io::Result<Choices> {
        match std::fs::read(dir.join(CHOICES_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Choices::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        std::fs::write(dir.join(CHOICES_FILE), json)
    }

    pub fn choose(&mut self, name: &str, path: PathBuf) {
        self.0.insert(name.to_string(), path);
    }

    fn get(&self, name: &str) -> Option<&Path> {
        self.0.get(name).map(PathBuf::as_path)
    }
}

/// Finds each Component in order: the user's choice, Detection, then the Bundled Variant.
pub struct Resolver {
    /// Where the installer puts the Bundled Variants, one `<name>/bin` per Component.
    pub bundled: PathBuf,
    pub choices: Choices,
    pub search_dirs: Vec<PathBuf>,
}

impl Resolver {
    pub fn of(app: &AppHandle) -> Result<Resolver, String> {
        let resources = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?;
        let config = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;
        Ok(Resolver {
            bundled: resources.join(BUNDLED_DIR),
            choices: Choices::load(&config).map_err(|error| error.to_string())?,
            search_dirs: detection::search_dirs(),
        })
    }

    /// Finds where `component` is, logging where it was found and how long finding it took.
    pub fn status(&self, component: &Component) -> ComponentStatus {
        let started = Instant::now();
        let status = self.find(component);
        let seconds = started.elapsed().as_secs_f64();
        match (&status.path, status.origin) {
            (Some(path), Some(origin)) => log::info!(
                "components: {} found ({origin:?}) at {} in {seconds:.2}s",
                component.name,
                path.display()
            ),
            _ => log::info!(
                "components: {} not ready after {seconds:.2}s: {}",
                component.name,
                status.hint.as_deref().unwrap_or_default()
            ),
        }
        status
    }

    fn find(&self, component: &Component) -> ComponentStatus {
        let found = |path: PathBuf, origin| ComponentStatus {
            name: component.name.clone(),
            ready: true,
            path: Some(path),
            origin: Some(origin),
            hint: None,
        };
        let missing = |hint: String| ComponentStatus {
            name: component.name.clone(),
            ready: false,
            path: None,
            origin: None,
            hint: Some(hint),
        };
        if let Some(chosen) = self
            .choices
            .get(&component.name)
            .filter(|path| path.is_file())
        {
            return found(chosen.to_path_buf(), Origin::Chosen);
        }
        if let Some(detected) = detection::detect(
            &component.program,
            &component.version_flag,
            &self.search_dirs,
        ) {
            return found(detected, Origin::Detected);
        }
        let bundled = self.bundled_executable(component);
        if !bundled.is_file() {
            return missing(component.install_hint.clone());
        }
        if detection::runs(&bundled, &component.version_flag) {
            found(bundled, Origin::Bundled)
        } else {
            missing(format!(
                "the bundled {} does not run; a driver or system library it needs may be missing",
                component.program
            ))
        }
    }

    fn bundled_executable(&self, component: &Component) -> PathBuf {
        self.bundled.join(&component.name).join("bin").join(format!(
            "{}{}",
            component.program,
            std::env::consts::EXE_SUFFIX
        ))
    }
}

/// The executable of a Component that is ready to run, or why it is not.
pub fn ready_executable(name: &str, resolver: &Resolver) -> Result<PathBuf, String> {
    let component = components()
        .into_iter()
        .find(|component| component.name == name)
        .ok_or_else(|| format!("{name} is not a Component"))?;
    let status = resolver.status(&component);
    status.path.ok_or_else(|| {
        format!(
            "{name} is not installed: {}",
            status.hint.unwrap_or_default()
        )
    })
}

fn statuses(resolver: &Resolver) -> Vec<ComponentStatus> {
    components()
        .iter()
        .map(|component| resolver.status(component))
        .collect()
}

/// Finds every Component on the blocking pool, since finding one runs it.
async fn statuses_off_the_main_thread(resolver: Resolver) -> Result<Vec<ComponentStatus>, String> {
    async_runtime::spawn_blocking(move || statuses(&resolver))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {
    statuses_off_the_main_thread(Resolver::of(&app)?).await
}

#[tauri::command]
pub async fn choose_component(
    app: AppHandle,
    name: String,
    path: PathBuf,
) -> Result<Vec<ComponentStatus>, String> {
    let config = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let mut resolver = Resolver::of(&app)?;
    resolver.choices.choose(&name, path);
    resolver
        .choices
        .save(&config)
        .map_err(|error| error.to_string())?;
    statuses_off_the_main_thread(resolver).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{captured_logs, TempDir};

    fn tool() -> Component {
        component("tool", "tool", "--version", "brew install tool")
    }

    /// A resolver with no choices, no Detection directories and no Bundled Variants, so nothing is found.
    fn resolver(dir: &TempDir) -> Resolver {
        Resolver {
            bundled: dir.path().join("components"),
            choices: Choices::default(),
            search_dirs: Vec::new(),
        }
    }

    #[cfg(unix)]
    fn script(dir: &Path, name: &str, exit_code: i32) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\nexit {exit_code}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // @behavior CP-005
    #[test]
    fn tells_how_to_install_a_component_that_cannot_be_found() {
        let dir = TempDir::new("cp-missing");

        let status = resolver(&dir).status(&tool());

        assert!(!status.ready);
        assert_eq!(status.hint.as_deref(), Some("brew install tool"));
    }

    // @behavior CP-009
    #[test]
    fn uses_the_executable_the_user_chose() {
        let dir = TempDir::new("cp-chosen");
        let chosen = dir.file("my-tool");
        let mut resolver = resolver(&dir);
        resolver.choices.choose("tool", chosen.clone());

        let status = resolver.status(&tool());

        assert_eq!(
            (status.path, status.origin),
            (Some(chosen), Some(Origin::Chosen))
        );
    }

    // @behavior CP-010
    #[cfg(unix)]
    #[test]
    fn detects_an_installed_executable_that_runs() {
        let dir = TempDir::new("cp-detect");
        let installed = script(&dir.path().join("bin"), "tool", 0);
        script(&dir.path().join("components/tool/bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("empty"), dir.path().join("bin")];

        let status = resolver.status(&tool());

        assert_eq!(
            (status.path, status.origin),
            (Some(installed), Some(Origin::Detected))
        );
    }

    // @behavior CP-011
    #[cfg(unix)]
    #[test]
    fn passes_over_an_executable_that_does_not_run() {
        let dir = TempDir::new("cp-broken");
        script(&dir.path().join("broken"), "tool", 1);
        let working = script(&dir.path().join("working"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("broken"), dir.path().join("working")];

        let status = resolver.status(&tool());

        assert_eq!(status.path, Some(working));
    }

    // @behavior CP-015
    #[cfg(unix)]
    #[test]
    fn uses_the_bundled_variant() {
        let dir = TempDir::new("cp-bundled");
        let bundled = script(&dir.path().join("components/tool/bin"), "tool", 0);

        let status = resolver(&dir).status(&tool());

        assert_eq!(
            (status.path, status.origin),
            (Some(bundled), Some(Origin::Bundled))
        );
    }

    // @behavior CP-014
    #[cfg(unix)]
    #[test]
    fn reports_a_bundled_variant_that_does_not_run() {
        let dir = TempDir::new("cp-bundled-broken");
        script(&dir.path().join("components/tool/bin"), "tool", 127);

        let status = resolver(&dir).status(&tool());

        assert!(!status.ready);
        assert!(status.hint.unwrap().contains("does not run"));
    }

    // @behavior CP-016
    #[cfg(unix)]
    #[test]
    fn logs_where_a_component_was_found_and_how_long_it_took() {
        let dir = TempDir::new("cp-log");
        let installed = script(&dir.path().join("bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("bin")];

        let logs = captured_logs(|| {
            resolver.status(&tool());
        });

        let expected = format!(
            "components: tool found (Detected) at {} in ",
            installed.display()
        );
        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with(&expected), "{}", logs[0]);
        assert!(logs[0].ends_with('s'));
    }
}
