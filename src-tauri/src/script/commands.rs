use std::path::PathBuf;

use tauri::{AppHandle, State};

use super::{
    script_path, ExportFormatRequest, MacroMode, ScannedScript, ScriptRegistry, SCRIPTS_DIR,
};
use crate::failure::Failure;
use crate::json_settings::settings_dir;
use crate::processes::{AppPorts, Processes};
use crate::project::CurrentProject;
use crate::steps::commands::{begin_mode, work_directory};
use crate::steps::{run_mode, Mode, ModeLock};
use crate::system_opener::open_in_system;

/// What each of this machine's Scripts registers, loading again those changed since the last
/// scan, or every one when `is_forced`.
#[tauri::command]
#[specta::specta]
pub async fn scan_scripts(
    app: AppHandle,
    processes: State<'_, Processes>,
    registry: State<'_, ScriptRegistry>,
    is_forced: bool,
) -> Result<Vec<ScannedScript>, Failure> {
    let ports = AppPorts::new(&app, &processes);
    super::scan(
        &scripts_dir(&app)?,
        &registry,
        &ports,
        &std::env::current_exe()?,
        &work_directory(&app, "scan")?,
        is_forced,
    )
    .await
}

/// Runs the Macro `id` of the Script `script` on the Current Resource, handing it the Checked
/// Segments at `checked_segments`.
#[tauri::command]
#[specta::specta]
pub async fn run_macro(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
    script: String,
    id: String,
    checked_segments: Vec<usize>,
) -> Result<(), Failure> {
    let script = script_path(&scripts_dir(&app)?, &script)?;
    let tsuzuri = std::env::current_exe()?;
    let work = work_directory(&app, MacroMode::NAME)?;
    let (run, phases) = begin_mode(&app, &mode_lock, &processes, MacroMode::NAME).await;
    let mode = MacroMode {
        tsuzuri: &tsuzuri,
        script: &script,
        id: &id,
        checked_segments,
        work: &work,
    };
    run_mode(&mode, &run, current.inner(), phases).await
}

/// Writes to `path` the text the Export Format `request` names makes of the Current Resource.
#[tauri::command]
#[specta::specta]
pub async fn run_export_format(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    mode_lock: State<'_, ModeLock>,
    processes: State<'_, Processes>,
    request: ExportFormatRequest,
    path: PathBuf,
) -> Result<(), Failure> {
    let script = script_path(&scripts_dir(&app)?, &request.script)?;
    let input = current.export_input(request.has_speakers, request.has_blank_lines)?;
    let tsuzuri = std::env::current_exe()?;
    let work = work_directory(&app, "export")?;
    let (run, _phases) = begin_mode(&app, &mode_lock, &processes, "export").await;
    let text = run
        .run_until_cancelled(super::make_export_text(
            run.ports(),
            &tsuzuri,
            &script,
            &request.id,
            &input,
            &work,
        ))
        .await?;
    Ok(std::fs::write(&path, text)?)
}

/// Where an Export Format saves the Current Resource unless the user picks elsewhere: its name,
/// ending in `extension`.
#[tauri::command]
#[specta::specta]
pub fn export_format_path(
    current: State<'_, CurrentProject>,
    extension: String,
) -> Result<PathBuf, Failure> {
    current.export_format_path(&extension)
}

/// Opens this machine's Scripts folder, made first when it is not there yet.
#[tauri::command]
#[specta::specta]
pub fn open_scripts_directory(app: AppHandle) -> Result<(), Failure> {
    let dir = scripts_dir(&app)?;
    std::fs::create_dir_all(&dir)?;
    open_in_system(&dir)?;
    Ok(())
}

fn scripts_dir(app: &AppHandle) -> Result<PathBuf, Failure> {
    Ok(settings_dir(app)?.join(SCRIPTS_DIR))
}
