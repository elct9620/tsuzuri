use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use super::{run_transcribe, Tools, Transcription};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::project::CurrentProject;
use crate::timing::Phases;
use crate::toolchain::{self, settings};

#[tauri::command]
pub async fn transcribe(app: AppHandle, overwrite: bool) -> Result<Transcription, Failure> {
    let job = app
        .state::<CurrentProject>()
        .transcription_target(overwrite)?;
    let phases = Phases::start("transcribe", "prepare");
    app.report("prepare", None);
    let [ffmpeg, whisper] =
        toolchain::find_ready_executables(settings::resolver(&app)?, ["ffmpeg", "whisper"]).await?;
    let tools = Tools { ffmpeg, whisper };
    let settings = settings::load_settings(&app)?;
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis());
    let work = app
        .path()
        .app_cache_dir()?
        .join("work")
        .join(started_at.to_string());
    let processes = app.state::<Processes>().inner().clone();

    let ports = AppPorts {
        app: &app,
        processes: &processes,
    };
    let result = run_transcribe(
        &ports,
        &app.state::<CurrentProject>(),
        &tools,
        &settings,
        &job,
        &work,
        phases,
    )
    .await;
    let _ = std::fs::remove_dir_all(&work);
    result
}
