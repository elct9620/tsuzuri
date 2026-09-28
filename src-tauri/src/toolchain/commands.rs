use std::path::PathBuf;

use hf_hub::HFClient;
use tauri::{AppHandle, Emitter, Manager, State};

use super::hub::{self, hub_client, hub_token, ModelDownloads, RepositoryFile};
use super::presets::PresetModel;
use super::settings::{self, load_settings};
use super::{
    find_statuses_off_the_main_thread, Choices, ComponentStatus, ModelSettingsView, ModelSlot,
};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::model_source::ModelSource;

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
    source: ModelSource,
) -> Result<ModelSettingsView, Failure> {
    let mut settings = load_settings(&app)?;
    settings.choose(slot, source);
    settings.save(&settings_dir(&app)?)?;
    Ok(settings.view())
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    downloads: State<'_, ModelDownloads>,
    repo: String,
    file: String,
    revision: Option<String>,
) -> Result<ModelSource, Failure> {
    let client = app_hub_client(&app)?;
    let progress_app = app.clone();
    downloads
        .download(client, repo, file, revision, move |progress| {
            // @event model-download-progress
            let _ = progress_app.emit("model-download-progress", progress);
        })
        .await
}

#[tauri::command]
pub fn cancel_model_download(downloads: State<'_, ModelDownloads>, repo: String, file: String) {
    downloads.cancel(&repo, &file);
}

#[tauri::command]
pub async fn repository_files(
    app: AppHandle,
    repo: String,
    slot: ModelSlot,
) -> Result<Vec<RepositoryFile>, Failure> {
    let client = app_hub_client(&app)?;
    hub::list_model_files(&client, &repo, slot).await
}

#[tauri::command]
pub fn preset_models() -> Vec<PresetModel> {
    super::presets::catalog()
}

/// A client of the Hugging Face Hub using the cache and the login Hugging Face's own tools use.
fn app_hub_client(app: &AppHandle) -> Result<HFClient, Failure> {
    let token = hub_token(|name| std::env::var(name).ok(), &app.path().home_dir()?);
    hub_client(load_settings(app)?.hub_cache(), token.as_deref(), None)
}
