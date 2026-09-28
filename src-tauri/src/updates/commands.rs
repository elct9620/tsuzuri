use tauri::{AppHandle, Emitter, State};

use super::{
    check_at_launch, install_release, look_for_update, AppUpdate, FoundUpdate, UpdateSettings,
};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::processes::Processes;
use crate::steps::ModeLock;

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    found: State<'_, FoundUpdate>,
) -> Result<Option<AppUpdate>, Failure> {
    let update = look_for_update(&app).await?;
    Ok(found.keep(update))
}

#[tauri::command]
pub async fn check_for_update_at_launch(
    app: AppHandle,
    found: State<'_, FoundUpdate>,
) -> Result<Option<AppUpdate>, Failure> {
    let settings = UpdateSettings::load(&settings_dir(&app)?)?;
    let update = check_at_launch(&settings, look_for_update(&app)).await;
    Ok(found.keep(update))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    found: State<'_, FoundUpdate>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
) -> Result<(), Failure> {
    let update = found.update()?;
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
    Ok(UpdateSettings::load(&settings_dir(&app)?)?)
}

#[tauri::command]
pub fn choose_launch_check(
    app: AppHandle,
    has_launch_check: bool,
) -> Result<UpdateSettings, Failure> {
    UpdateSettings::record_launch_check(&settings_dir(&app)?, has_launch_check)?;
    update_settings(app)
}
