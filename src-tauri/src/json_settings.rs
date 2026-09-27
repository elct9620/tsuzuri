use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::failure::Failure;

/// Where settings saved across launches live.
pub fn settings_dir(app: &AppHandle) -> Result<PathBuf, Failure> {
    Ok(app.path().app_config_dir()?)
}

/// The settings saved as JSON at `path`, or the defaults when they were never saved.
pub fn read_or_default<T: DeserializeOwned + Default>(path: &Path) -> io::Result<T> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(io::Error::other),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(T::default()),
        Err(error) => Err(error),
    }
}

/// Saves `settings` as JSON at `path`, into a directory that is already there.
pub fn write(path: &Path, settings: &impl Serialize) -> io::Result<()> {
    let json = serde_json::to_vec_pretty(settings).map_err(io::Error::other)?;
    fs::write(path, json)
}
