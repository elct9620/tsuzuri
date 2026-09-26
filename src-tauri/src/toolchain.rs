use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::failure::Failure;

pub mod commands;
pub mod detection;
pub mod settings;

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
#[serde(rename_all = "kebab-case")]
pub enum Origin {
    Choice,
    Detection,
    BundledVariant,
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
    is_ready: bool,
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
    pub fn choose(&mut self, name: &str, path: PathBuf) {
        self.0.insert(name.to_string(), path);
    }

    pub fn forget(&mut self, name: &str) {
        self.0.remove(name);
    }

    fn path_by_name(&self, name: &str) -> Option<&Path> {
        self.0.get(name).map(PathBuf::as_path)
    }
}

/// Finds each Component in order: the user's choice, Detection, then the Bundled Variant Auto-Selection takes.
pub struct Resolver {
    /// Where the installer puts the Bundled Variants, one `<name>/<variant>/bin` each.
    pub bundled_dir: PathBuf,
    pub choices: Choices,
    pub search_dirs: Vec<PathBuf>,
}

impl Resolver {
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
            is_ready: true,
            path: Some(path),
            origin: Some(origin),
            variant: variant.cloned(),
            problem: None,
            install: None,
        };
        let missing = |problem| ComponentStatus {
            name: component.name.clone(),
            is_ready: false,
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
            return found(chosen.to_path_buf(), Origin::Choice, None);
        }
        if let Some(detected) = detection::detect(
            &component.program,
            &component.version_flag,
            &self.search_dirs,
        ) {
            return found(detected, Origin::Detection, None);
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
            Some((variant, path)) => found(path, Origin::BundledVariant, Some(variant)),
            None => missing(Problem::DoesNotRun),
        }
    }

    fn bundled_executable(&self, component: &Component, variant: &str) -> PathBuf {
        self.bundled_dir
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
    let found = tokio::task::spawn_blocking(move || {
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
pub async fn find_statuses_off_the_main_thread(
    resolver: Resolver,
) -> Result<Vec<ComponentStatus>, Failure> {
    Ok(tokio::task::spawn_blocking(move || find_statuses(&resolver)).await?)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelSlot {
    Transcription,
    Vad,
    Translation,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelSettings {
    transcription: Option<PathBuf>,
    vad: Option<PathBuf>,
    translation: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelError {
    NoChoice(ModelSlot),
    MissingFile(PathBuf),
}

impl fmt::Display for ModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ModelError::NoChoice(slot) => write!(f, "no {slot:?} model chosen"),
            ModelError::MissingFile(path) => write!(f, "model file not found: {}", path.display()),
        }
    }
}

impl std::error::Error for ModelError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SlotView {
    path: Option<PathBuf>,
    has_file: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ModelSettingsView {
    transcription: SlotView,
    vad: SlotView,
    translation: SlotView,
}

impl ModelSettings {
    pub fn choose(&mut self, slot: ModelSlot, path: PathBuf) {
        *self.slot_mut(slot) = Some(path);
    }

    /// These settings with a Project Model in `slot` in place of the general one, when there is one.
    pub fn with_project_model(mut self, slot: ModelSlot, path: Option<PathBuf>) -> ModelSettings {
        if let Some(path) = path {
            self.choose(slot, path);
        }
        self
    }

    /// The Model an engine is started with; checked right before the start so a file moved since it was chosen is caught.
    pub fn ready_path(&self, slot: ModelSlot) -> Result<&Path, ModelError> {
        let path = self.slot(slot).ok_or(ModelError::NoChoice(slot))?;
        if path.is_file() {
            Ok(path)
        } else {
            Err(ModelError::MissingFile(path.to_path_buf()))
        }
    }

    pub fn view(&self) -> ModelSettingsView {
        let slot_view = |slot| SlotView {
            path: self.slot(slot).map(Path::to_path_buf),
            has_file: self.ready_path(slot).is_ok(),
        };
        ModelSettingsView {
            transcription: slot_view(ModelSlot::Transcription),
            vad: slot_view(ModelSlot::Vad),
            translation: slot_view(ModelSlot::Translation),
        }
    }

    fn slot(&self, slot: ModelSlot) -> Option<&Path> {
        match slot {
            ModelSlot::Transcription => self.transcription.as_deref(),
            ModelSlot::Vad => self.vad.as_deref(),
            ModelSlot::Translation => self.translation.as_deref(),
        }
    }

    fn slot_mut(&mut self, slot: ModelSlot) -> &mut Option<PathBuf> {
        match slot {
            ModelSlot::Transcription => &mut self.transcription,
            ModelSlot::Vad => &mut self.vad,
            ModelSlot::Translation => &mut self.translation,
        }
    }
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
            bundled_dir: dir.path().join("components"),
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
            (status.is_ready, status.problem, status.install.as_deref()),
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
            (Some(chosen), Some(Origin::Choice))
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
            (Some(installed), Some(Origin::Detection))
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
            (Some(bundled), Some(Origin::BundledVariant), Some("first"))
        );
    }

    // @behavior CP-020
    #[cfg(unix)]
    #[test]
    fn returns_to_the_bundled_variant_once_the_choice_is_forgotten() {
        let dir = TempDir::new("cp-forget");
        let bundled = script(&dir.path().join("components/tool/first/bin"), "tool", 0);
        let mut resolver = resolver(&dir);
        resolver.choices.choose("tool", dir.file("my-tool"));

        resolver.choices.forget("tool");

        let status = resolver.find(&tool());
        assert_eq!(
            (status.path, status.origin),
            (Some(bundled), Some(Origin::BundledVariant))
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
            (status.is_ready, status.problem),
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
            "components: tool found (Detection) at {} in ",
            installed.display()
        );
        assert_eq!(logs.len(), 1);
        assert!(logs[0].starts_with(&expected), "{}", logs[0]);
        assert!(logs[0].ends_with('s'));
    }

    // @behavior MD-001
    #[test]
    fn remembers_the_chosen_model_across_loads() {
        let dir = TempDir::new("remember");
        let model = dir.file("breeze.bin");
        let mut settings = ModelSettings::load(dir.path()).unwrap();
        settings.choose(ModelSlot::Transcription, model.clone());
        settings.save(dir.path()).unwrap();

        let reloaded = ModelSettings::load(dir.path()).unwrap();

        assert_eq!(
            reloaded.ready_path(ModelSlot::Transcription),
            Ok(model.as_path())
        );
    }

    // @behavior MD-002
    #[test]
    fn refuses_a_slot_with_no_model_chosen() {
        let settings = ModelSettings::default();

        let result = settings.ready_path(ModelSlot::Translation);

        assert_eq!(result, Err(ModelError::NoChoice(ModelSlot::Translation)));
    }

    // @behavior MD-003
    #[test]
    fn refuses_a_model_file_that_is_gone() {
        let dir = TempDir::new("gone");
        let model = dir.file("breeze.bin");
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Transcription, model.clone());
        std::fs::remove_file(&model).unwrap();

        let result = settings.ready_path(ModelSlot::Transcription);

        assert_eq!(result, Err(ModelError::MissingFile(model)));
    }

    // @behavior MD-007
    #[test]
    fn takes_the_project_model_over_the_general_one() {
        let dir = TempDir::new("project-model");
        let general = dir.file("breeze.bin");
        let project = dir.file("kotoba.bin");
        let mut settings = ModelSettings::default();
        settings.choose(ModelSlot::Transcription, general);

        let settings = settings.with_project_model(ModelSlot::Transcription, Some(project.clone()));

        assert_eq!(
            settings.ready_path(ModelSlot::Transcription),
            Ok(project.as_path())
        );
    }
}
