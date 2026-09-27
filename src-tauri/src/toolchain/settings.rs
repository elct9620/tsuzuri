use std::fs;
use std::io;
use std::path::Path;

use tauri::{AppHandle, Manager};

use super::{detection, Choices, ModelSettings, Resolver};
use crate::failure::Failure;
use crate::json_settings::{self, settings_dir};

const BUNDLED_DIR: &str = "components";
const CHOICES_FILE: &str = "components.json";
const SETTINGS_FILE: &str = "models.json";

impl Choices {
    /// Choices never saved load as none, so a first launch relies on Detection and the Bundled Variants.
    pub fn load(dir: &Path) -> io::Result<Choices> {
        json_settings::read_or_default(&dir.join(CHOICES_FILE))
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        json_settings::write(&dir.join(CHOICES_FILE), self)
    }
}

impl ModelSettings {
    /// Settings that were never saved load as empty, so a first launch needs no setup.
    pub fn load(dir: &Path) -> io::Result<ModelSettings> {
        json_settings::read_or_default(&dir.join(SETTINGS_FILE))
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        json_settings::write(&dir.join(SETTINGS_FILE), self)
    }
}

/// Finds Components with the Bundled Variants the installer placed and the Choices saved.
pub fn resolver(app: &AppHandle) -> Result<Resolver, Failure> {
    let resources = app.path().resource_dir()?;
    let config = settings_dir(app)?;
    Ok(Resolver {
        bundled_dir: resources.join(BUNDLED_DIR),
        choices: Choices::load(&config)?,
        search_dirs: detection::search_dirs(),
    })
}

pub fn load_settings(app: &AppHandle) -> Result<ModelSettings, Failure> {
    Ok(ModelSettings::load(&settings_dir(app)?)?)
}
