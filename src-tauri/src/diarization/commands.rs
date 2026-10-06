use tauri::{AppHandle, State};

use super::{Diarization, DiarizeMode, Tools};
use crate::failure::Failure;
use crate::processes::Processes;
use crate::project::CurrentProject;
use crate::steps::commands::{begin_mode, work_directory};
use crate::steps::{run_mode, Mode, ModeLock};
use crate::toolchain::{self, settings};
use crate::translation::ResidentLlama;

#[tauri::command]
#[specta::specta]
pub async fn diarize(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
    resident: State<'_, ResidentLlama>,
) -> Result<Diarization, Failure> {
    let (run, phases) = begin_mode(&app, &mode_lock, &processes, DiarizeMode::NAME).await;
    // Only one Model is loaded at a time, so the translation Model makes way.
    resident.make_room(run.ports()).await;
    let [ffmpeg] =
        toolchain::find_ready_executables(settings::resolver(&app)?, [toolchain::FFMPEG]).await?;
    let tools = Tools {
        ffmpeg,
        diarizer: std::env::current_exe()?,
    };
    let models = settings::load_settings(&app)?;
    let work = work_directory(&app, DiarizeMode::NAME)?;
    let mode = DiarizeMode {
        tools: &tools,
        models: &models,
        work: &work,
    };
    run_mode(&mode, &run, current.inner(), phases).await
}
