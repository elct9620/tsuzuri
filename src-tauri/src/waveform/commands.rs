use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use super::{extract, Waveform};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::project::CurrentProject;
use crate::toolchain::{self, settings};

#[tauri::command]
pub async fn extract_waveform(app: AppHandle) -> Result<Waveform, Failure> {
    let [ffmpeg] = toolchain::find_ready_executables(settings::resolver(&app)?, ["ffmpeg"]).await?;
    let processes = app.state::<Processes>().inner().clone();
    let ports = AppPorts::new(&app, &processes);
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let work = app
        .path()
        .app_cache_dir()?
        .join("work")
        .join(format!("waveform-{started_at}"));
    extract(&ports, &app.state::<CurrentProject>(), &ffmpeg, &work).await
}
