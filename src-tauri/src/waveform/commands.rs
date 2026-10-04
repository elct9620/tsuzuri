use tauri::{AppHandle, State};

use super::{extract, Waveform};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::project::CurrentProject;
use crate::steps::commands::work_directory;
use crate::toolchain::{self, settings};

#[tauri::command]
#[specta::specta]
pub async fn extract_waveform(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    processes: State<'_, Processes>,
) -> Result<Waveform, Failure> {
    let [ffmpeg] =
        toolchain::find_ready_executables(settings::resolver(&app)?, [toolchain::FFMPEG]).await?;
    let ports = AppPorts::new(&app, &processes);
    let work = work_directory(&app, "waveform")?;
    extract(&ports, &current, &ffmpeg, &work).await
}
