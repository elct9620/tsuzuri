use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::failure::Failure;

const SETTINGS_FILE: &str = "models.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelSlot {
    Transcription,
    Translation,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelSettings {
    transcription: Option<PathBuf>,
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
    translation: SlotView,
}

impl ModelSettings {
    /// Settings that were never saved load as empty, so a first launch needs no setup.
    pub fn load(dir: &Path) -> io::Result<ModelSettings> {
        match fs::read(dir.join(SETTINGS_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(ModelSettings::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        fs::write(dir.join(SETTINGS_FILE), json)
    }

    pub fn choose(&mut self, slot: ModelSlot, path: PathBuf) {
        *self.slot_mut(slot) = Some(path);
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
            translation: slot_view(ModelSlot::Translation),
        }
    }

    fn slot(&self, slot: ModelSlot) -> Option<&Path> {
        match slot {
            ModelSlot::Transcription => self.transcription.as_deref(),
            ModelSlot::Translation => self.translation.as_deref(),
        }
    }

    fn slot_mut(&mut self, slot: ModelSlot) -> &mut Option<PathBuf> {
        match slot {
            ModelSlot::Transcription => &mut self.transcription,
            ModelSlot::Translation => &mut self.translation,
        }
    }
}

/// Where settings saved across launches live.
pub fn settings_dir(app: &AppHandle) -> Result<PathBuf, Failure> {
    Ok(app.path().app_config_dir()?)
}

pub fn load_settings(app: &AppHandle) -> Result<ModelSettings, Failure> {
    Ok(ModelSettings::load(&settings_dir(app)?)?)
}

#[tauri::command]
pub fn model_settings(app: AppHandle) -> Result<ModelSettingsView, Failure> {
    Ok(load_settings(&app)?.view())
}

#[tauri::command]
pub fn choose_model(
    app: AppHandle,
    slot: ModelSlot,
    path: PathBuf,
) -> Result<ModelSettingsView, Failure> {
    let mut settings = load_settings(&app)?;
    settings.choose(slot, path);
    settings.save(&settings_dir(&app)?)?;
    Ok(settings.view())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

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
        fs::remove_file(&model).unwrap();

        let result = settings.ready_path(ModelSlot::Transcription);

        assert_eq!(result, Err(ModelError::MissingFile(model)));
    }
}
