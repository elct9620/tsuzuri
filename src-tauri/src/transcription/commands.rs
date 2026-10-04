use tauri::{AppHandle, State};

use super::{run_transcribe, Tools, Transcription, TranscriptionSettings};
use crate::failure::Failure;
use crate::json_settings;
use crate::processes::Processes;
use crate::project::{CurrentProject, TranscriptionRequest, TranscriptionScope};
use crate::steps::commands::{begin_mode, end_mode, work_directory};
use crate::steps::ModeLock;
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
    let (run, phases) = begin_mode(&app, &mode_lock, &processes, "transcribe").await;
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
    let work = work_directory(&app, "transcribe")?;
    let result = run
        .run_until_cancelled(run_transcribe(
            &run,
            current.inner(),
            &tools,
            &models,
            general_settings,
            TranscriptionRequest {
                is_overwrite_allowed: overwrite,
                scope,
            },
            &work,
            phases,
        ))
        .await;
    end_mode(&app, run);
    result
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
