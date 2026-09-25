use std::path::PathBuf;

use tauri::AppHandle;

use super::settings::{self, load_settings, settings_dir};
use super::{
    find_statuses_off_the_main_thread, Choices, ComponentStatus, ModelSettingsView, ModelSlot,
};
use crate::failure::Failure;

#[tauri::command]
pub async fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, Failure> {
    find_statuses_off_the_main_thread(settings::resolver(&app)?).await
}

/// Saves the Choices `change` leaves behind and finds every Component with them.
async fn change_choices(
    app: &AppHandle,
    change: impl FnOnce(&mut Choices),
) -> Result<Vec<ComponentStatus>, Failure> {
    let mut resolver = settings::resolver(app)?;
    change(&mut resolver.choices);
    resolver.choices.save(&settings_dir(app)?)?;
    find_statuses_off_the_main_thread(resolver).await
}

#[tauri::command]
pub async fn choose_component(
    app: AppHandle,
    name: String,
    path: PathBuf,
) -> Result<Vec<ComponentStatus>, Failure> {
    change_choices(&app, |choices| choices.choose(&name, path)).await
}

#[tauri::command]
pub async fn forget_component(
    app: AppHandle,
    name: String,
) -> Result<Vec<ComponentStatus>, Failure> {
    change_choices(&app, |choices| choices.forget(&name)).await
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
