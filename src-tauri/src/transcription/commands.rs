use tauri::{AppHandle, State};

use super::{Tools, TranscribeMode, Transcription, TranscriptionSettings};
use crate::failure::Failure;
use crate::json_settings;
use crate::processes::Processes;
use crate::project::{CurrentProject, TranscriptionRequest, TranscriptionScope};
use crate::steps::commands::{begin_mode, work_directory};
use crate::steps::{run_mode, Mode, ModeLock};
use crate::toolchain::{self, settings};
use crate::translation::ResidentLlama;

#[tauri::command]
#[specta::specta]
pub async fn transcribe(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
    resident: State<'_, ResidentLlama>,
    overwrite: bool,
    scope: TranscriptionScope,
) -> Result<Transcription, Failure> {
    let (run, phases) = begin_mode(&app, &mode_lock, &processes, TranscribeMode::NAME).await;
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
    let work = work_directory(&app, TranscribeMode::NAME)?;
    let mode = TranscribeMode {
        tools: &tools,
        models: &models,
        settings: general_settings,
        request: TranscriptionRequest {
            is_overwrite_allowed: overwrite,
            scope,
        },
        work: &work,
    };
    run_mode(&mode, &run, current.inner(), phases).await
}

#[tauri::command]
#[specta::specta]
pub fn transcription_settings(app: AppHandle) -> Result<TranscriptionSettings, Failure> {
    Ok(TranscriptionSettings::load(&json_settings::settings_dir(
        &app,
    )?)?)
}

#[tauri::command]
#[specta::specta]
pub fn save_transcription_settings(
    app: AppHandle,
    settings: TranscriptionSettings,
) -> Result<TranscriptionSettings, Failure> {
    settings.save(&json_settings::settings_dir(&app)?)?;
    Ok(settings)
}
