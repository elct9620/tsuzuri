pub mod detection;

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Manager};

use crate::failure::Failure;

const BUNDLED_DIR: &str = "components";
const CHOICES_FILE: &str = "components.json";
/// The Build Manifest, read for the order Auto-Selection tries each Component's Variants in.
const BUILD_MANIFEST: &str = include_str!("../../components.json");

#[cfg(target_os = "macos")]
const PLATFORM: &str = "macos";
#[cfg(target_os = "linux")]
const PLATFORM: &str = "linux";
#[cfg(windows)]
const PLATFORM: &str = "windows";

/// An executable Tsuzuri runs as a child process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Component {
    pub name: String,
    /// The executable's file name without extension, as package managers install it.
    pub program: String,
    /// A flag the executable answers with success, proving it runs.
    pub version_flag: String,
    /// The command that installs it, where the platform has one package manager to name.
    pub install: Option<String>,
    /// The Variants this platform may bundle, in the order Auto-Selection tries them.
    pub variants: Vec<String>,
}

/// The Variants the Build Manifest lists for `name` on this platform.
fn variants_of(name: &str) -> Vec<String> {
    let manifest: serde_json::Value =
        serde_json::from_str(BUILD_MANIFEST).expect("components.json is valid JSON");
    manifest[name]["variants"][PLATFORM]
        .as_array()
        .map(|variants| {
            variants
                .iter()
                .filter_map(|variant| variant.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn component(name: &str, program: &str, version_flag: &str, install: Option<&str>) -> Component {
    Component {
        name: name.to_string(),
        program: program.to_string(),
        version_flag: version_flag.to_string(),
        install: install.map(str::to_string),
        variants: variants_of(name),
    }
}

/// Every Component, in the order a Mode runs them.
#[cfg(target_os = "macos")]
pub fn components() -> Vec<Component> {
    vec![
        component("ffmpeg", "ffmpeg", "-version", Some("brew install ffmpeg")),
        component(
            "whisper",
            "whisper-cli",
            "--version",
            Some("brew install whisper-cpp"),
        ),
        component(
            "llama",
            "llama-server",
            "--version",
            Some("brew install llama.cpp"),
        ),
    ]
}

/// Every Component, in the order a Mode runs them.
#[cfg(not(target_os = "macos"))]
pub fn components() -> Vec<Component> {
    vec![
        component("ffmpeg", "ffmpeg", "-version", None),
        component("whisper", "whisper-cli", "--version", None),
        component("llama", "llama-server", "--version", None),
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Chosen,
    Detected,
    Bundled,
}

/// Why a Component is not ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Problem {
    NotInstalled,
    /// The Bundled Variant is there but fails its version flag, as when a driver it needs is missing.
    DoesNotRun,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ComponentStatus {
    name: String,
    ready: bool,
    path: Option<PathBuf>,
    origin: Option<Origin>,
    /// The Bundled Variant Auto-Selection took, when that is where it was found.
    variant: Option<String>,
    problem: Option<Problem>,
    install: Option<String>,
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

    fn path_by_name(&self, name: &str) -> Option<&Path> {
        self.0.get(name).map(PathBuf::as_path)
    }
}

/// Finds each Component in order: the user's choice, Detection, then the Bundled Variant Auto-Selection takes.
pub struct Resolver {
    /// Where the installer puts the Bundled Variants, one `<name>/<variant>/bin` each.
    pub bundled: PathBuf,
    pub choices: Choices,
    pub search_dirs: Vec<PathBuf>,
}

impl Resolver {
    pub fn from_app(app: &AppHandle) -> Result<Resolver, Failure> {
        let resources = app.path().resource_dir()?;
        let config = app.path().app_config_dir()?;
        Ok(Resolver {
            bundled: resources.join(BUNDLED_DIR),
            choices: Choices::load(&config)?,
            search_dirs: detection::search_dirs(),
        })
    }

    /// Finds where `component` is, logging where it was found and how long finding it took.
    pub fn find(&self, component: &Component) -> ComponentStatus {
        let started = Instant::now();
        let status = self.resolve(component);
        let seconds = started.elapsed().as_secs_f64();
        match (&status.path, status.origin) {
            (Some(path), Some(origin)) => log::info!(
                "components: {} found ({origin:?}) at {} in {seconds:.2}s",
                component.name,
                path.display()
            ),
            _ => log::info!(
                "components: {} not ready after {seconds:.2}s: {:?}",
                component.name,
                status.problem
            ),
        }
        status
    }

    fn resolve(&self, component: &Component) -> ComponentStatus {
        let found = |path: PathBuf, origin, variant: Option<&String>| ComponentStatus {
            name: component.name.clone(),
            ready: true,
            path: Some(path),
            origin: Some(origin),
            variant: variant.cloned(),
            problem: None,
            install: None,
        };
        let missing = |problem| ComponentStatus {
            name: component.name.clone(),
            ready: false,
            path: None,
            origin: None,
            variant: None,
            problem: Some(problem),
            install: component.install.clone(),
        };
        if let Some(chosen) = self
            .choices
            .path_by_name(&component.name)
            .filter(|path| path.is_file())
        {
            return found(chosen.to_path_buf(), Origin::Chosen, None);
        }
        if let Some(detected) = detection::detect(
            &component.program,
            &component.version_flag,
            &self.search_dirs,
        ) {
            return found(detected, Origin::Detected, None);
        }
        let bundled: Vec<(&String, PathBuf)> = component
            .variants
            .iter()
            .map(|variant| (variant, self.bundled_executable(component, variant)))
            .filter(|(_, path)| path.is_file())
            .collect();
        if bundled.is_empty() {
            return missing(Problem::NotInstalled);
        }
        match bundled
            .into_iter()
            .find(|(_, path)| detection::probe(path, &component.version_flag))
        {
            Some((variant, path)) => found(path, Origin::Bundled, Some(variant)),
            None => missing(Problem::DoesNotRun),
        }
    }

    fn bundled_executable(&self, component: &Component, variant: &str) -> PathBuf {
        self.bundled
            .join(&component.name)
            .join(variant)
            .join("bin")
            .join(format!(
                "{}{}",
                component.program,
                std::env::consts::EXE_SUFFIX
            ))
    }
}

/// The executable of a Component that is ready to run, or why it is not.
fn find_ready_executable(name: &str, resolver: &Resolver) -> Result<PathBuf, Failure> {
    let component = components()
        .into_iter()
        .find(|component| component.name == name)
        .ok_or_else(|| Failure::Internal {
            detail: format!("{name} is not a Component"),
        })?;
    resolver
        .find(&component)
        .path
        .ok_or_else(|| Failure::ComponentNotReady {
            component: name.to_string(),
        })
}

fn find_statuses(resolver: &Resolver) -> Vec<ComponentStatus> {
    components()
        .iter()
        .map(|component| resolver.find(component))
        .collect()
}

/// The ready executable of each named Component, found on the blocking pool since finding one runs it.
pub async fn find_ready_executables<const N: usize>(
    resolver: Resolver,
    names: [&'static str; N],
) -> Result<[PathBuf; N], Failure> {
    let found = async_runtime::spawn_blocking(move || {
        names
            .iter()
            .map(|name| find_ready_executable(name, &resolver))
            .collect::<Result<Vec<_>, _>>()
    })
    .await??;
    Ok(found
        .try_into()
        .expect("one executable is found for each name"))
}

/// Finds every Component on the blocking pool, since finding one runs it.
async fn find_statuses_off_the_main_thread(
    resolver: Resolver,
) -> Result<Vec<ComponentStatus>, Failure> {
    Ok(async_runtime::spawn_blocking(move || find_statuses(&resolver)).await?)
}

#[tauri::command]
pub async fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, Failure> {
    find_statuses_off_the_main_thread(Resolver::from_app(&app)?).await
}

#[tauri::command]
pub async fn choose_component(
    app: AppHandle,
    name: String,
    path: PathBuf,
) -> Result<Vec<ComponentStatus>, Failure> {
    let config = app.path().app_config_dir()?;
    let mut resolver = Resolver::from_app(&app)?;
    resolver.choices.choose(&name, path);
    resolver.choices.save(&config)?;
    find_statuses_off_the_main_thread(resolver).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    /// A Component whose Build Manifest lists two Variants, tried `first` then `second`.
    fn tool() -> Component {
        Component {
            variants: vec!["first".to_string(), "second".to_string()],
            ..component("tool", "tool", "--version", Some("brew install tool"))
        }
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
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        crate::test_support::write_executable(&path, &format!("#!/bin/sh\nexit {exit_code}\n"));
        path
    }

    // @behavior CP-005
    #[test]
    fn tells_how_to_install_a_component_that_cannot_be_found() {
        let dir = TempDir::new("cp-missing");

        let status = resolver(&dir).find(&tool());

        assert_eq!(
            (status.ready, status.problem, status.install.as_deref()),
            (
                false,
                Some(Problem::NotInstalled),
                Some("brew install tool")
            )
        );
    }

    // @behavior CP-009
    #[test]
    fn uses_the_executable_the_user_chose() {
        let dir = TempDir::new("cp-chosen");
        let chosen = dir.file("my-tool");
        let mut resolver = resolver(&dir);
        resolver.choices.choose("tool", chosen.clone());

        let status = resolver.find(&tool());

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
        script(&dir.path().join("components/tool/first/bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("empty"), dir.path().join("bin")];

        let status = resolver.find(&tool());

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

        let status = resolver.find(&tool());

        assert_eq!(status.path, Some(working));
    }

    // @behavior CP-015
    #[cfg(unix)]
    #[test]
    fn uses_the_bundled_variant() {
        let dir = TempDir::new("cp-bundled");
        let bundled = script(&dir.path().join("components/tool/first/bin"), "tool", 0);

        let status = resolver(&dir).find(&tool());

        assert_eq!(
            (status.path, status.origin, status.variant.as_deref()),
            (Some(bundled), Some(Origin::Bundled), Some("first"))
        );
    }

    // @behavior CP-017
    #[cfg(unix)]
    #[test]
    fn passes_over_a_bundled_variant_that_does_not_run() {
        let dir = TempDir::new("cp-bundled-next");
        script(&dir.path().join("components/tool/first/bin"), "tool", 127);
        let second = script(&dir.path().join("components/tool/second/bin"), "tool", 0);

        let status = resolver(&dir).find(&tool());

        assert_eq!(status.path, Some(second));
    }

    // @behavior CP-018
    #[cfg(unix)]
    #[test]
    fn tries_bundled_variants_in_the_build_manifests_order() {
        let dir = TempDir::new("cp-bundled-order");
        script(&dir.path().join("components/tool/second/bin"), "tool", 0);
        let first = script(&dir.path().join("components/tool/first/bin"), "tool", 0);

        let status = resolver(&dir).find(&tool());

        assert_eq!(status.path, Some(first));
    }

    // @behavior CP-014
    #[cfg(unix)]
    #[test]
    fn reports_a_bundled_variant_that_does_not_run() {
        let dir = TempDir::new("cp-bundled-broken");
        script(&dir.path().join("components/tool/first/bin"), "tool", 127);
        script(&dir.path().join("components/tool/second/bin"), "tool", 127);

        let status = resolver(&dir).find(&tool());

        assert_eq!(
            (status.ready, status.problem),
            (false, Some(Problem::DoesNotRun))
        );
    }

    // @behavior CP-016
    #[cfg(unix)]
    #[test]
    fn logs_where_a_component_was_found_and_how_long_it_took() {
        use crate::test_support::captured_logs;
        let dir = TempDir::new("cp-log");
        let installed = script(&dir.path().join("bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.search_dirs = vec![dir.path().join("bin")];

        let logs = captured_logs(|| {
            resolver.find(&tool());
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
