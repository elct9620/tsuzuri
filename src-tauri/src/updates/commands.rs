use tauri::{AppHandle, Emitter, State};

use super::{
    check_at_launch, install_release, look_for_rollback, look_for_update, AppUpdate, FoundUpdate,
    UpdateChannel, UpdateSettings,
};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::processes::Processes;
use crate::release_number::preview_release;
use crate::steps::ModeLock;

/// The update site, which publishes each Update Channel's manifest.
const UPDATE_SITE: &str = "https://tsuzuri.aotoki.me";

/// The channel this build follows until one is chosen.
fn running_build_channel() -> UpdateChannel {
    UpdateChannel::from_build(preview_release(env!("CARGO_PKG_VERSION")).is_some())
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    found_update: State<'_, FoundUpdate>,
) -> Result<Option<AppUpdate>, Failure> {
    let settings = UpdateSettings::load(&settings_dir(&app)?, running_build_channel())?;
    let update = look_for_update(&app, settings.channel.manifest_url(UPDATE_SITE)?).await?;
    Ok(found_update.keep(update))
}

#[tauri::command]
pub async fn check_for_update_at_launch(
    app: AppHandle,
    found_update: State<'_, FoundUpdate>,
) -> Result<Option<AppUpdate>, Failure> {
    let settings = UpdateSettings::load(&settings_dir(&app)?, running_build_channel())?;
    let manifest = settings.channel.manifest_url(UPDATE_SITE)?;
    let update = check_at_launch(&settings, look_for_update(&app, manifest)).await;
    Ok(found_update.keep(update))
}

#[tauri::command]
pub async fn check_for_rollback(
    app: AppHandle,
    found_update: State<'_, FoundUpdate>,
) -> Result<Option<AppUpdate>, Failure> {
    let manifest = UpdateChannel::Stable.manifest_url(UPDATE_SITE)?;
    let update = look_for_rollback(&app, manifest).await?;
    Ok(found_update.keep(update))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    found_update: State<'_, FoundUpdate>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
) -> Result<(), Failure> {
    let update = found_update.update()?;
    install_release(
        update.as_ref(),
        &mode_lock,
        || processes.kill_all(),
        |progress| {
            // @event update-progress
            let _ = app.emit("update-progress", progress);
        },
    )
    .await?;
    // Only macOS and Linux get here: the Windows installer has already ended Tsuzuri and restarts it.
    app.restart()
}

#[tauri::command]
pub fn update_settings(app: AppHandle) -> Result<UpdateSettings, Failure> {
    Ok(UpdateSettings::load(
        &settings_dir(&app)?,
        running_build_channel(),
    )?)
}

#[tauri::command]
pub fn choose_launch_check(
    app: AppHandle,
    has_launch_check: bool,
) -> Result<UpdateSettings, Failure> {
    UpdateSettings::record_launch_check(&settings_dir(&app)?, has_launch_check)?;
    update_settings(app)
}

#[tauri::command]
pub fn choose_update_channel(
    app: AppHandle,
    channel: UpdateChannel,
) -> Result<UpdateSettings, Failure> {
    UpdateSettings::record_channel(&settings_dir(&app)?, channel)?;
    update_settings(app)
}
