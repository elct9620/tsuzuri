use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use super::{run_diarize, Diarization, Tools};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::project::CurrentProject;
use crate::steps::{ModeLock, WORK_DIR};
use crate::timing::{Phase, Phases};
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
    let job = current.diarization_target()?;
    let phases = Phases::start("diarize", Phase::Preparation);
    app.report(Phase::Preparation, None);
    let run = mode_lock.begin(AppPorts::new(&app, &processes)).await;
    // Only one Model is loaded at a time, so the translation Model makes way.
    resident.make_room(run.ports()).await;
    let [ffmpeg] =
        toolchain::find_ready_executables(settings::resolver(&app)?, [toolchain::FFMPEG]).await?;
    let tools = Tools {
        ffmpeg,
        diarizer: std::env::current_exe()?,
    };
    let models = settings::load_settings(&app)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis());
    let work = app
        .path()
        .app_cache_dir()?
        .join(WORK_DIR)
        .join(started_at.to_string());
    let result = run
        .run_until_cancelled(run_diarize(
            &run,
            current.inner(),
            &tools,
            &models,
            &job,
            &work,
            phases,
        ))
        .await;
    // The Mode's hold and its intermediate files end with its run, however it ended.
    drop(run);
    app.announce_project();
    result
}
