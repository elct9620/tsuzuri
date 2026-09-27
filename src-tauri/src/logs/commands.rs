use std::path::PathBuf;

use tauri::{AppHandle, State};

use super::{LogDirInUse, LogDirectory, LogSettings};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::system_opener::open_in_system;

#[tauri::command]
pub fn log_directory(
    app: AppHandle,
    log_dir: State<'_, LogDirInUse>,
) -> Result<LogDirectory, Failure> {
    let settings = LogSettings::load(&settings_dir(&app)?)?;
    let in_use = log_dir.0.clone();
    Ok(LogDirectory {
        next_launch: settings.log_dir(in_use.clone()),
        in_use,
    })
}

#[tauri::command]
pub fn choose_log_directory(
    app: AppHandle,
    log_dir: State<'_, LogDirInUse>,
    path: PathBuf,
) -> Result<LogDirectory, Failure> {
    LogSettings {
        directory: Some(path),
    }
    .save(&settings_dir(&app)?)?;
    log_directory(app, log_dir)
}

#[tauri::command]
pub fn open_log_directory(log_dir: State<'_, LogDirInUse>) -> Result<(), Failure> {
    open_in_system(&log_dir.0)?;
    Ok(())
}
