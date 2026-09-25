use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use super::current::open_directory_of;
use super::glossary::{GlossaryRow, GlossaryTable};
use super::versions::{compare, ComparedRow, RevertPart, SubtitleVersions};
use super::{CurrentProject, Project, ProjectOptions, ProjectView, SegmentField};
use crate::failure::Failure;
use crate::language::Language;
use crate::progress::Progress;
use crate::segment_change::SegmentChange;
use crate::transcript::SrtContent;

#[tauri::command]
pub fn open_project(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .replace(Project::open(path, language)?);
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn open_srt(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .replace(open_directory_of(&path, language)?);
    app.announce_project();
    Ok(())
}

/// Reads the Current Resource again when a subtitle of it was changed elsewhere, and tells the
/// webview; a failure is logged, since nobody asked for this read.
pub fn read_again_if_changed<R: Runtime>(app: &AppHandle<R>) {
    match app.state::<CurrentProject>().read_again_if_changed() {
        Ok(true) => app.announce_project(),
        Ok(false) => {}
        Err(failure) => log::warn!("could not read the Current Resource again: {failure:?}"),
    }
}

#[tauri::command]
pub fn select_resource(app: AppHandle, name: String) -> Result<(), Failure> {
    app.state::<CurrentProject>().select(&name)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn show_translation(app: AppHandle, language: Option<Language>) -> Result<(), Failure> {
    app.state::<CurrentProject>().show_translation(language)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn set_primary_language(app: AppHandle, language: Language) -> Result<(), Failure> {
    app.state::<CurrentProject>().set_language(language)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn set_project_options(app: AppHandle, options: ProjectOptions) -> Result<(), Failure> {
    app.state::<CurrentProject>().set_options(options)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn current_project(app: AppHandle) -> Option<ProjectView> {
    app.state::<CurrentProject>().view()
}

#[tauri::command]
pub fn edit_segment(
    app: AppHandle,
    index: usize,
    field: SegmentField,
    value: String,
) -> Result<(), Failure> {
    let result = app.state::<CurrentProject>().edit(index, field, value);
    app.announce_project();
    result
}

#[tauri::command]
pub fn change_segments(app: AppHandle, change: SegmentChange) -> Result<(), Failure> {
    let result = app.state::<CurrentProject>().change_segments(change);
    app.announce_project();
    result
}

#[tauri::command]
pub fn revert_row(
    app: AppHandle,
    language: Option<Language>,
    backup: String,
    row: usize,
    part: RevertPart,
) -> Result<(), Failure> {
    let result = app
        .state::<CurrentProject>()
        .revert_row(language, &backup, row, part);
    app.announce_project();
    result
}

#[tauri::command]
pub fn undo(app: AppHandle) -> Result<(), Failure> {
    let result = app.state::<CurrentProject>().undo();
    app.announce_project();
    result
}

#[tauri::command]
pub fn redo(app: AppHandle) -> Result<(), Failure> {
    let result = app.state::<CurrentProject>().redo();
    app.announce_project();
    result
}

#[tauri::command]
pub fn export_path(app: AppHandle, content: SrtContent) -> Result<PathBuf, Failure> {
    app.state::<CurrentProject>().export_path(content)
}

#[tauri::command]
pub fn save_srt(app: AppHandle, path: PathBuf, content: SrtContent) -> Result<(), Failure> {
    app.state::<CurrentProject>().save_srt(&path, content)
}

#[tauri::command]
pub fn subtitle_versions(app: AppHandle) -> Result<Vec<SubtitleVersions>, Failure> {
    app.state::<CurrentProject>().subtitle_versions()
}

#[tauri::command]
pub fn compare_versions(
    app: AppHandle,
    language: Option<Language>,
    left: Option<String>,
    right: Option<String>,
) -> Result<Vec<ComparedRow>, Failure> {
    let current = app.state::<CurrentProject>();
    Ok(compare(
        &current.version_transcript(language, left.as_deref())?,
        &current.version_transcript(language, right.as_deref())?,
    ))
}

#[tauri::command]
pub fn restore_version(
    app: AppHandle,
    language: Option<Language>,
    backup: String,
) -> Result<(), Failure> {
    let result = app
        .state::<CurrentProject>()
        .restore_version(language, &backup);
    app.announce_project();
    result
}

#[tauri::command]
pub fn translation_glossary_table(app: AppHandle) -> Result<GlossaryTable, Failure> {
    app.state::<CurrentProject>().glossary_table()
}

#[tauri::command]
pub fn save_translation_glossary(app: AppHandle, rows: Vec<GlossaryRow>) -> Result<(), Failure> {
    app.state::<CurrentProject>()
        .save_translation_glossary(&rows)?;
    app.announce_project();
    Ok(())
}
