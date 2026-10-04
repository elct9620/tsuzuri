use std::path::PathBuf;

use tauri::{AppHandle, State};

use super::{DebugLog, DebugLogInUse, LogDirInUse, LogDirectory, LogSettings};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::system_opener::open_in_system;

#[tauri::command]
#[specta::specta]
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
#[specta::specta]
pub fn choose_log_directory(
    app: AppHandle,
    log_dir: State<'_, LogDirInUse>,
    path: PathBuf,
) -> Result<LogDirectory, Failure> {
    LogSettings::record_directory(&settings_dir(&app)?, path)?;
    log_directory(app, log_dir)
}

#[tauri::command]
#[specta::specta]
pub fn debug_log(app: AppHandle, debug_log: State<'_, DebugLogInUse>) -> Result<DebugLog, Failure> {
    let settings = LogSettings::load(&settings_dir(&app)?)?;
    Ok(DebugLog {
        is_written_now: debug_log.0,
        is_written_next_launch: settings.has_debug_log,
    })
}

#[tauri::command]
#[specta::specta]
pub fn choose_debug_log(
    app: AppHandle,
    debug_log: State<'_, DebugLogInUse>,
    has_debug_log: bool,
) -> Result<DebugLog, Failure> {
    LogSettings::record_debug_log(&settings_dir(&app)?, has_debug_log)?;
    self::debug_log(app, debug_log)
}

#[tauri::command]
#[specta::specta]
pub fn open_log_directory(log_dir: State<'_, LogDirInUse>) -> Result<(), Failure> {
    open_in_system(&log_dir.0)?;
    Ok(())
}
