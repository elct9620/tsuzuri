use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Manager};

use super::{LogDirInUse, LogDirectory, LogSettings};
use crate::failure::Failure;
use crate::toolchain::settings::settings_dir;

#[tauri::command]
pub fn log_directory(app: AppHandle) -> Result<LogDirectory, Failure> {
    let settings = LogSettings::load(&settings_dir(&app)?)?;
    let in_use = app.state::<LogDirInUse>().0.clone();
    Ok(LogDirectory {
        chosen: settings.log_dir(in_use.clone()),
        in_use,
    })
}

#[tauri::command]
pub fn choose_log_directory(app: AppHandle, path: PathBuf) -> Result<LogDirectory, Failure> {
    LogSettings {
        directory: Some(path),
    }
    .save(&settings_dir(&app)?)?;
    log_directory(app)
}

#[tauri::command]
pub fn open_log_directory(app: AppHandle) -> Result<(), Failure> {
    let directory = app.state::<LogDirInUse>().0.clone();
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
