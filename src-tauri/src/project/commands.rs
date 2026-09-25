use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use super::current::open_directory_of;
use super::glossary::{GlossaryRow, GlossaryTable};
use super::versions::{compare, ComparedCue, ComparedRow, RevertPart, SubtitleVersions};
use super::{CurrentProject, Project, ProjectOptions, ProjectView, SegmentField};
use crate::failure::Failure;
use crate::language::Language;
use crate::progress::Progress;
use crate::segment_change::SegmentChange;
use crate::transcript::SrtContent;

#[tauri::command]
pub fn open_project(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    replace_project(&app, Project::open(path, language)?)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
pub fn open_srt(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {
    replace_project(&app, open_directory_of(&path, language)?)?;
    app.announce_project();
    Ok(())
}

/// Holds `project` as the Current Project and lets the webview read the files of its directory,
/// so the Preview can load the media; nothing outside an opened Project is handed to it.
fn replace_project<R: Runtime>(app: &AppHandle<R>, project: Project) -> Result<(), Failure> {
    app.asset_protocol_scope()
        .allow_directory(&project.directory, false)?;
    app.state::<CurrentProject>().replace(project);
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
pub fn translation_cues(app: AppHandle, language: Language) -> Result<Vec<ComparedCue>, Failure> {
    app.state::<CurrentProject>().translation_cues(language)
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

#[cfg(test)]
mod tests {
    use std::fs;

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    use super::*;
    use crate::test_support::TempDir;

    fn mock_app() -> tauri::App<MockRuntime> {
        mock_builder()
            .manage(CurrentProject::default())
            .build(mock_context(noop_assets()))
            .unwrap()
    }

    fn create_directory(dir: &TempDir, name: &str, files: &[&str]) -> PathBuf {
        let directory = dir.path().join(name);
        fs::create_dir_all(&directory).unwrap();
        for file in files {
            fs::write(directory.join(file), "").unwrap();
        }
        directory
    }

    // @behavior PV-001
    #[test]
    fn lets_the_webview_read_a_media_file_of_the_project() {
        let dir = TempDir::new("pv-read-media");
        let directory = create_directory(&dir, "talks", &["ep01.mp4"]);
        let app = mock_app();

        let project = Project::open(directory.clone(), Language::TraditionalChinese).unwrap();
        replace_project(app.handle(), project).unwrap();

        assert!(app
            .asset_protocol_scope()
            .is_allowed(directory.join("ep01.mp4")));
    }

    // @behavior PV-002
    #[test]
    fn keeps_the_webview_from_files_outside_the_project() {
        let dir = TempDir::new("pv-outside");
        let directory = create_directory(&dir, "talks", &["ep01.mp4"]);
        let other = create_directory(&dir, "others", &["ep02.mp4"]);
        let app = mock_app();

        let project = Project::open(directory, Language::TraditionalChinese).unwrap();
        replace_project(app.handle(), project).unwrap();

        assert!(!app
            .asset_protocol_scope()
            .is_allowed(other.join("ep02.mp4")));
    }

    // @behavior PV-003
    #[test]
    fn lets_the_webview_read_the_directory_of_an_opened_srt() {
        let dir = TempDir::new("pv-srt");
        let directory = create_directory(&dir, "talks", &["ep01.mp4", "ep01.srt"]);
        let app = mock_app();

        let project =
            open_directory_of(&directory.join("ep01.srt"), Language::TraditionalChinese).unwrap();
        replace_project(app.handle(), project).unwrap();

        assert!(app
            .asset_protocol_scope()
            .is_allowed(directory.join("ep01.mp4")));
    }
}
