use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State, Wry};

use super::{ModeLock, ModeRun, WORK_DIR};
use crate::failure::Failure;
use crate::processes::{AppPorts, Processes};
use crate::progress::Progress;
use crate::timing::{Phase, Phases};

#[tauri::command]
#[specta::specta]
pub fn cancel_task(mode_lock: State<'_, ModeLock>) {
    mode_lock.cancel();
}

/// Begins a run of `mode` once no other Mode runs, its Phases starting with preparing the
/// Components, so waiting for the turn counts in none of them.
pub async fn begin_mode<'a>(
    app: &'a AppHandle,
    mode_lock: &'a ModeLock,
    processes: &'a Processes,
    mode: &'static str,
) -> (ModeRun<'a, AppPorts<'a, Wry>>, Phases) {
    let run = mode_lock.begin(AppPorts::new(app, processes)).await;
    let phases = Phases::start(mode, Phase::Preparation);
    app.report(Phase::Preparation, None);
    (run, phases)
}

/// Ends `run`, so its hold, what it showed and its intermediate files end with it however it
/// ended, and tells the webview the Project may have changed.
pub fn end_mode(app: &AppHandle, run: ModeRun<'_, AppPorts<'_, Wry>>) {
    drop(run);
    app.announce_project();
}

/// The directory a run of `kind` keeps its intermediate files in, under the app's cache and
/// named by when it started, so two runs never share one.
pub fn work_directory(app: &AppHandle, kind: &str) -> Result<PathBuf, Failure> {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    Ok(app
        .path()
        .app_cache_dir()?
        .join(WORK_DIR)
        .join(format!("{kind}-{started_at}")))
}
