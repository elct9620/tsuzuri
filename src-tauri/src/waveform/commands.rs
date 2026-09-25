use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};

use super::{extract, Waveform};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::project::CurrentProject;
use crate::toolchain::{self, settings};

#[tauri::command]
pub async fn extract_waveform(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    processes: State<'_, Processes>,
) -> Result<Waveform, Failure> {
    let [ffmpeg] = toolchain::find_ready_executables(settings::resolver(&app)?, ["ffmpeg"]).await?;
    let ports = AppPorts::new(&app, &processes);
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let work = app
        .path()
        .app_cache_dir()?
        .join("work")
        .join(format!("waveform-{started_at}"));
    extract(&ports, &current, &ffmpeg, &work).await
}
