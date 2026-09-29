use std::fs;
use std::io;
use std::path::Path;

use tauri::{AppHandle, Manager};

use super::{detection, hub, Choices, ModelSettings, Resolver};
use crate::failure::Failure;
use crate::json_settings::{self, settings_dir};

const BUNDLED_DIR: &str = "components";
const CHOICES_FILE: &str = "components.json";
const SETTINGS_FILE: &str = "models.json";

impl Choices {
    /// Choices never saved load as none, so a first launch relies on Detection and the Bundled Variants.
    pub fn load(dir: &Path) -> io::Result<Choices> {
        json_settings::settings_at(&dir.join(CHOICES_FILE))
    }

    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        json_settings::write(&dir.join(CHOICES_FILE), self)
    }
}

impl ModelSettings {
    /// Settings that were never saved load as empty, so a first launch needs no setup.
    pub fn load(dir: &Path) -> io::Result<ModelSettings> {
        json_settings::settings_at(&dir.join(SETTINGS_FILE))
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

/// The general Model settings, with the Hugging Face Cache their Repositories' Models are found in.
pub fn load_settings(app: &AppHandle) -> Result<ModelSettings, Failure> {
    let hub_cache = hub::hub_cache(|name| std::env::var(name).ok(), &app.path().home_dir()?);
    Ok(ModelSettings::load(&settings_dir(app)?)?.with_hub_cache(hub_cache))
}
