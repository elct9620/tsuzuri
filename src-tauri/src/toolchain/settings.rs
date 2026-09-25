use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{detection, Choices, ModelSettings, Resolver};
use crate::failure::Failure;

const BUNDLED_DIR: &str = "components";
const CHOICES_FILE: &str = "components.json";
const SETTINGS_FILE: &str = "models.json";

impl Choices {
    /// Choices never saved load as none, so a first launch relies on Detection and the Bundled Variants.
    pub fn load(dir: &Path) -> io::Result<Choices> {
        match fs::read(dir.join(CHOICES_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Choices::default()),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        fs::write(dir.join(CHOICES_FILE), json)
    }
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
}

/// Finds Components with the Bundled Variants the installer placed and the Choices saved.
pub fn resolver(app: &AppHandle) -> Result<Resolver, Failure> {
    let resources = app.path().resource_dir()?;
    let config = settings_dir(app)?;
    Ok(Resolver {
        bundled: resources.join(BUNDLED_DIR),
        choices: Choices::load(&config)?,
        search_dirs: detection::search_dirs(),
    })
}

/// Where settings saved across launches live.
pub fn settings_dir(app: &AppHandle) -> Result<PathBuf, Failure> {
    Ok(app.path().app_config_dir()?)
}

pub fn load_settings(app: &AppHandle) -> Result<ModelSettings, Failure> {
    Ok(ModelSettings::load(&settings_dir(app)?)?)
}
