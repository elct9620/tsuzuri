use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use super::{run_transcribe, Tools, Transcription, TranscriptionSettings};
use crate::failure::Failure;
use crate::json_settings;
use crate::processes::{AppPorts, Processes};
use crate::progress::{Phase, Progress};
use crate::project::{CurrentProject, TranscriptionScope};
use crate::steps::ModeLock;
use crate::timing::Phases;
use crate::toolchain::{self, settings};
use crate::translation::ResidentLlama;

#[tauri::command]
pub async fn transcribe(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
    resident: State<'_, ResidentLlama>,
    overwrite: bool,
    scope: TranscriptionScope,
) -> Result<Transcription, Failure> {
    let job = current.transcription_target(overwrite, scope)?;
    let phases = Phases::start("transcribe", Phase::Prepare);
    app.report(Phase::Prepare, None);
    let run = mode_lock.begin(AppPorts::new(&app, &processes)).await;
    // Only one Model is loaded at a time, so the translation Model makes way for whisper's.
    resident.make_room(run.ports()).await;
    let [ffmpeg, whisper] = toolchain::find_ready_executables(
        settings::resolver(&app)?,
        [toolchain::FFMPEG, toolchain::WHISPER],
    )
    .await?;
    let tools = Tools { ffmpeg, whisper };
    let models = settings::load_settings(&app)?;
    let general_settings = TranscriptionSettings::load(&json_settings::settings_dir(&app)?)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis());
    let work = app
        .path()
        .app_cache_dir()?
        .join("work")
        .join(started_at.to_string());
    let result = run
        .run_until_cancelled(run_transcribe(
            &run,
            current.inner(),
            &tools,
            &models,
            general_settings,
            &job,
            &work,
            phases,
        ))
        .await;
    let _ = std::fs::remove_dir_all(&work);
    // The Mode's hold and what it showed end with its run, however it ended.
    drop(run);
    app.announce_project();
    result
}

#[tauri::command]
pub fn transcription_settings(app: AppHandle) -> Result<TranscriptionSettings, Failure> {
    Ok(TranscriptionSettings::load(&json_settings::settings_dir(
        &app,
    )?)?)
}

#[tauri::command]
pub fn save_transcription_settings(
    app: AppHandle,
    settings: TranscriptionSettings,
) -> Result<TranscriptionSettings, Failure> {
    settings.save(&json_settings::settings_dir(&app)?)?;
    Ok(settings)
}
