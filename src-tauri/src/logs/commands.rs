use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, State};

use super::{LogDirInUse, LogDirectory, LogSettings};
use crate::failure::Failure;
use crate::toolchain::settings::settings_dir;

#[tauri::command]
pub fn log_directory(
    app: AppHandle,
    log_dir: State<'_, LogDirInUse>,
) -> Result<LogDirectory, Failure> {
    let settings = LogSettings::load(&settings_dir(&app)?)?;
    let in_use = log_dir.0.clone();
    Ok(LogDirectory {
        chosen: settings.log_dir(in_use.clone()),
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
    let directory = log_dir.0.clone();
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let opener = "xdg-open";
    // The file manager answers at once; its status says nothing about the directory opening.
    let _ = Command::new(opener).arg(&directory).status()?;
    Ok(())
}
