use tauri::AppHandle;

use super::Preferences;
use crate::failure::Failure;
use crate::json_settings::settings_dir;

#[tauri::command]
#[specta::specta]
pub fn preferences(app: AppHandle) -> Result<Preferences, Failure> {
    Ok(Preferences::load(&settings_dir(&app)?)?)
}

#[tauri::command]
#[specta::specta]
pub fn save_preferences(app: AppHandle, preferences: Preferences) -> Result<Preferences, Failure> {
    preferences.save(&settings_dir(&app)?)?;
    Ok(preferences)
}
