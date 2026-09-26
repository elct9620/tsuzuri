use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use super::{run_transcribe, Tools, Transcription, TranscriptionSettings};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::project::CurrentProject;
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
) -> Result<Transcription, Failure> {
    let job = current.transcription_target(overwrite)?;
    let phases = Phases::start("transcribe", "prepare");
    app.report("prepare", None);
    let run = mode_lock.begin(AppPorts::new(&app, &processes)).await;
    // Only one Model is loaded at a time, so the translation Model makes way for whisper's.
    resident.make_room(run.ports()).await;
    let [ffmpeg, whisper] =
        toolchain::find_ready_executables(settings::resolver(&app)?, ["ffmpeg", "whisper"]).await?;
    let tools = Tools { ffmpeg, whisper };
    let models = settings::load_settings(&app)?;
    let general_settings = TranscriptionSettings::load(&settings::settings_dir(&app)?)?;
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
    result
}

#[tauri::command]
pub fn transcription_settings(app: AppHandle) -> Result<TranscriptionSettings, Failure> {
    Ok(TranscriptionSettings::load(&settings::settings_dir(&app)?)?)
}

#[tauri::command]
pub fn save_transcription_settings(
    app: AppHandle,
    settings: TranscriptionSettings,
) -> Result<TranscriptionSettings, Failure> {
    settings.save(&settings::settings_dir(&app)?)?;
    Ok(settings)
}
