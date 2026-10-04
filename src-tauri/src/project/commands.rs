use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_specta::Event;

use super::current::open_directory_of;
use super::glossary::{GlossaryRow, GlossaryTable};
use super::recent::{project_views, RecentProjectView, RecentProjects};
use super::requested_srt::{srt_argument, RequestedSrt};
use super::versions::{compare, ComparedCue, ComparedRow, RevertPart, SubtitleVersions};
use super::{
    CleanupScope, CurrentProject, ExportFormat, Project, ProjectModelPresets, ProjectModels,
    ProjectOptions, ProjectView, Reload, Restoration, SegmentField, TextMatch,
};
use crate::failure::Failure;
use crate::json_settings;
use crate::language::Language;
use crate::progress::Progress;
use crate::replacement::{Replacement, Search};
use crate::segment_change::SegmentChange;
use crate::steps::ModeLock;
use crate::toolchain::presets::preset_index;
use crate::toolchain::ModelSlot;
use crate::transcript::WrittenText;

#[tauri::command]
#[specta::specta]
pub fn open_project(
    app: AppHandle,
    mode_lock: State<'_, ModeLock>,
    path: PathBuf,
    language: Language,
) -> Result<(), Failure> {
    hold_opened(&app, &mode_lock, || Project::open(path, language))
}

#[tauri::command]
#[specta::specta]
pub fn open_srt(
    app: AppHandle,
    mode_lock: State<'_, ModeLock>,
    path: PathBuf,
    language: Language,
) -> Result<(), Failure> {
    hold_opened(&app, &mode_lock, || open_directory_of(&path, language))
}

/// The system asked to open an SRT file while Tsuzuri runs; the webview takes it with
/// `take_requested_srt`.
// @event srt-requested
#[derive(Clone, Serialize, specta::Type, Event)]
#[tauri_specta(event_name = "srt-requested")]
pub struct SrtRequested;

/// A subtitle changed elsewhere was read again, and what Tsuzuri last held of it kept as an
/// Overwrite Backup.
// @event changed-elsewhere-kept
#[derive(Clone, Serialize, specta::Type, Event)]
#[tauri_specta(event_name = "changed-elsewhere-kept")]
pub struct ChangedElsewhereKept;

/// Keeps the SRT file among `arguments`, given to a launch in `directory`, as the Requested SRT
/// and tells the webview, which opens it as the toolbar would: only the webview knows the
/// Interface Language a directory without a Project Config opens in.
pub fn request_srt_argument<R: Runtime>(
    app: &AppHandle<R>,
    arguments: impl IntoIterator<Item = String>,
    directory: &Path,
) {
    let Some(srt) = srt_argument(arguments, directory) else {
        return;
    };
    app.state::<RequestedSrt>().request(srt);
    let _ = SrtRequested.emit(app);
}

#[tauri::command]
#[specta::specta]
pub fn take_requested_srt(requested: State<'_, RequestedSrt>) -> Option<PathBuf> {
    requested.take()
}

#[tauri::command]
#[specta::specta]
pub async fn recent_projects(
    app: AppHandle,
    current: State<'_, CurrentProject>,
) -> Result<Vec<RecentProjectView>, Failure> {
    let recent = RecentProjects::load(&json_settings::settings_dir(&app)?)?;
    let projects = recent.projects_without(current.directory().as_deref());
    Ok(tokio::task::spawn_blocking(move || project_views(projects)).await?)
}

/// Holds the Project `open` opens as the Current Project and tells the webview, keeping the
/// Recent Projects up to date whether it opened or not. A running Mode writes into the Project
/// open, so none may be running, and none starts until the new Project is held.
fn hold_opened<R: Runtime>(
    app: &AppHandle<R>,
    mode_lock: &ModeLock,
    open: impl FnOnce() -> Result<Project, Failure>,
) -> Result<(), Failure> {
    let _turn = mode_lock.try_turn().ok_or(Failure::OpeningDuringMode)?;
    let opened_project = open();
    match json_settings::settings_dir(app) {
        Ok(settings) => {
            RecentProjects::follow_opening(&settings, &opened_project, SystemTime::now())
        }
        Err(failure) => log::warn!("could not find the Recent Projects: {failure:?}"),
    }
    replace_project(app, opened_project?)?;
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

/// Answers `result` once the webview is told the Project changed, which a change may have done
/// even when refused: a subtitle found changed elsewhere is then read again.
fn announce_after<T, R: Runtime>(
    app: &AppHandle<R>,
    result: Result<T, Failure>,
) -> Result<T, Failure> {
    app.announce_project();
    result
}

/// Tells the webview what a reload did: that the Project changed, and that a version of a
/// subtitle changed elsewhere was kept, so the user knows where to find it.
fn announce_reload<R: Runtime>(app: &AppHandle<R>, reload: Reload) {
    if reload == Reload::Unchanged {
        return;
    }
    app.announce_project();
    if reload == Reload::ChangedWithBackup {
        let _ = ChangedElsewhereKept.emit(app);
    }
}

/// Reloads the Project when its files were changed elsewhere, and tells the webview; a failure
/// is logged, since nobody asked for this read.
pub fn reload_if_changed<R: Runtime>(app: &AppHandle<R>) {
    match app.state::<CurrentProject>().reload_if_changed() {
        Ok(reload) => announce_reload(app, reload),
        Err(Failure::NoProject) => {}
        Err(failure) => log::warn!("could not reload the Project: {failure:?}"),
    }
}

#[tauri::command]
#[specta::specta]
pub fn select_resource(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    name: String,
) -> Result<(), Failure> {
    current.select(&name)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn show_translation(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    language: Option<Language>,
) -> Result<(), Failure> {
    current.show_translation(language)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn reload_project(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {
    let reload = current.reload()?;
    announce_reload(&app, reload);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_primary_language(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    language: Language,
) -> Result<(), Failure> {
    current.set_language(language)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_project_options(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    options: ProjectOptions,
) -> Result<(), Failure> {
    current.set_options(options)?;
    app.announce_project();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn current_project(current: State<'_, CurrentProject>) -> Option<ProjectView> {
    current.view().map(|view| {
        let presets = project_model_presets(&view.options().models);
        view.with_project_model_presets(presets)
    })
}

/// Which Preset Model each of `models` is. The Preset Models belong to the toolchain, which the
/// Project may not reach, so the view is completed here, where commands join the two.
fn project_model_presets(models: &ProjectModels) -> ProjectModelPresets {
    let index_among_presets = |slot, source: &Option<_>| {
        source
            .as_ref()
            .and_then(|source| preset_index(slot, source))
    };
    ProjectModelPresets {
        transcription: index_among_presets(ModelSlot::Transcription, &models.transcription),
        translation: index_among_presets(ModelSlot::Translation, &models.translation),
    }
}

#[tauri::command]
#[specta::specta]
pub fn edit_segment(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    index: usize,
    field: SegmentField,
    value: String,
) -> Result<(), Failure> {
    announce_after(&app, current.edit(index, field, value))
}

#[tauri::command]
#[specta::specta]
pub fn set_speakers(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    indexes: Vec<usize>,
    speaker: String,
) -> Result<(), Failure> {
    announce_after(&app, current.set_speakers(&indexes, &speaker))
}

#[tauri::command]
#[specta::specta]
pub fn replace_text(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    field: SegmentField,
    replacement: Replacement,
) -> Result<usize, Failure> {
    announce_after(&app, current.replace_text(field, &replacement))
}

#[tauri::command]
#[specta::specta]
pub fn find_text(
    current: State<'_, CurrentProject>,
    field: SegmentField,
    search: Search,
) -> Result<Vec<TextMatch>, Failure> {
    current.text_matches(field, &search)
}

#[tauri::command]
#[specta::specta]
pub fn clean_simplified(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    scope: CleanupScope,
) -> Result<usize, Failure> {
    announce_after(&app, current.clean_simplified(&scope))
}

#[tauri::command]
#[specta::specta]
pub fn change_segments(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    change: SegmentChange,
) -> Result<(), Failure> {
    announce_after(&app, current.change_segments(change))
}

#[tauri::command]
#[specta::specta]
pub fn translation_cues(
    current: State<'_, CurrentProject>,
    language: Language,
) -> Result<Vec<ComparedCue>, Failure> {
    current.translation_cues(language)
}

#[tauri::command]
#[specta::specta]
pub fn revert_row(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    language: Option<Language>,
    backup: String,
    row: usize,
    part: RevertPart,
) -> Result<Restoration, Failure> {
    announce_after(&app, current.revert_row(language, &backup, row, part))
}

#[tauri::command]
#[specta::specta]
pub fn undo(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {
    announce_after(&app, current.undo())
}

#[tauri::command]
#[specta::specta]
pub fn redo(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {
    announce_after(&app, current.redo())
}

#[tauri::command]
#[specta::specta]
pub fn export_path(
    current: State<'_, CurrentProject>,
    content: WrittenText,
    format: ExportFormat,
) -> Result<PathBuf, Failure> {
    current.export_path(content, format)
}

#[tauri::command]
#[specta::specta]
pub fn save_srt(
    current: State<'_, CurrentProject>,
    path: PathBuf,
    content: WrittenText,
) -> Result<(), Failure> {
    current.save_srt(&path, content)
}

#[tauri::command]
#[specta::specta]
pub fn save_text(
    current: State<'_, CurrentProject>,
    path: PathBuf,
    content: WrittenText,
    has_speakers: bool,
    has_blank_lines: bool,
) -> Result<(), Failure> {
    current.save_text(&path, content, has_speakers, has_blank_lines)
}

#[tauri::command]
#[specta::specta]
pub fn subtitle_versions(
    current: State<'_, CurrentProject>,
) -> Result<Vec<SubtitleVersions>, Failure> {
    current.subtitle_versions()
}

#[tauri::command]
#[specta::specta]
pub fn compare_versions(
    current: State<'_, CurrentProject>,
    language: Option<Language>,
    left: Option<String>,
    right: Option<String>,
) -> Result<Vec<ComparedRow>, Failure> {
    Ok(compare(
        &current.version_transcript(language, left.as_deref())?,
        &current.version_transcript(language, right.as_deref())?,
    ))
}

#[tauri::command]
#[specta::specta]
pub fn restore_version(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    language: Option<Language>,
    backup: String,
) -> Result<Restoration, Failure> {
    announce_after(&app, current.restore_version(language, &backup))
}

#[tauri::command]
#[specta::specta]
pub fn translation_glossary_table(
    current: State<'_, CurrentProject>,
) -> Result<GlossaryTable, Failure> {
    current.glossary_table()
}

#[tauri::command]
#[specta::specta]
pub fn save_translation_glossary(
    app: AppHandle,
    current: State<'_, CurrentProject>,
    rows: Vec<GlossaryRow>,
) -> Result<(), Failure> {
    current.save_translation_glossary(&rows)?;
    app.announce_project();
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{Duration, UNIX_EPOCH};

    use crate::test_support::build_mock_app;
    use tauri::test::{mock_builder, MockRuntime};

    use crate::project::recent::RecentProject;

    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use crate::progress::ProjectChanged;

    use super::*;
    use crate::test_support::TempDir;

    fn mock_app() -> tauri::App<MockRuntime> {
        build_mock_app(mock_builder().manage(CurrentProject::default()))
    }

    fn create_directory(dir: &TempDir, name: &str, files: &[&str]) -> PathBuf {
        let directory = dir.path().join(name);
        fs::create_dir_all(&directory).unwrap();
        for file in files {
            fs::write(directory.join(file), "").unwrap();
        }
        directory
    }

    /// Opens `directory` as `open_project` does at `seconds` past the Unix epoch, keeping the
    /// Recent Projects in `settings`.
    fn open_at(settings: &Path, directory: PathBuf, seconds: u64) -> Result<Project, Failure> {
        let opened_project = Project::open(directory, Language::TraditionalChinese);
        RecentProjects::follow_opening(
            settings,
            &opened_project,
            UNIX_EPOCH + Duration::from_secs(seconds),
        );
        opened_project
    }

    fn recent_directories(settings: &Path) -> Vec<PathBuf> {
        RecentProjects::load(settings)
            .unwrap()
            .projects_without(None)
            .into_iter()
            .map(|project| project.directory)
            .collect()
    }

    // @behavior PJ-166
    #[test]
    fn refuses_to_open_a_project_while_a_mode_runs() {
        let dir = TempDir::new("pj-opening-during-mode");
        let lecture = create_directory(&dir, "lecture", &["ep01.mp4"]);
        let interview = create_directory(&dir, "interview", &["talk.srt"]);
        let app = mock_app();
        let project = Project::open(lecture.clone(), Language::TraditionalChinese).unwrap();
        replace_project(app.handle(), project).unwrap();
        let mode_lock = ModeLock::default();
        let _running_mode = mode_lock.try_turn().unwrap();

        let result = hold_opened(app.handle(), &mode_lock, || {
            Project::open(interview, Language::TraditionalChinese)
        });

        assert_eq!(
            (result, app.state::<CurrentProject>().directory()),
            (Err(Failure::OpeningDuringMode), Some(lecture))
        );
    }

    // @behavior PJ-154
    #[test]
    fn keeps_an_opened_directory_as_a_recent_project() {
        let dir = TempDir::new("pj-recent-opened");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &["ep01.srt"]);

        open_at(&settings, lecture.clone(), 1_790_303_400).unwrap();

        assert_eq!(
            RecentProjects::load(&settings)
                .unwrap()
                .projects_without(None),
            vec![RecentProject {
                directory: lecture,
                opened_at_ms: 1_790_303_400_000,
            }]
        );
    }

    // @behavior PJ-155
    #[test]
    fn keeps_the_directory_of_an_opened_srt_as_a_recent_project() {
        let dir = TempDir::new("pj-recent-srt");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &["ep01.srt"]);

        let opened_project =
            open_directory_of(&lecture.join("ep01.srt"), Language::TraditionalChinese);
        RecentProjects::follow_opening(&settings, &opened_project, SystemTime::now());

        assert_eq!(recent_directories(&settings), vec![lecture]);
    }

    // @behavior PJ-156
    #[test]
    fn keeps_one_recent_project_per_directory() {
        let dir = TempDir::new("pj-recent-once");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &[]);
        let interview = create_directory(&dir, "interview", &[]);
        open_at(&settings, lecture.clone(), 1).unwrap();
        open_at(&settings, interview.clone(), 2).unwrap();

        open_at(&settings, lecture.clone(), 3).unwrap();

        assert_eq!(recent_directories(&settings), vec![lecture, interview]);
    }

    // @behavior PJ-157
    #[test]
    fn keeps_ten_recent_projects() {
        let dir = TempDir::new("pj-recent-ten");
        let settings = dir.path().join("settings");
        let directories: Vec<PathBuf> = (1..=11)
            .map(|number| create_directory(&dir, &format!("ep{number:02}"), &[]))
            .collect();
        for (seconds, directory) in directories[..10].iter().enumerate() {
            open_at(&settings, directory.clone(), seconds as u64).unwrap();
        }

        open_at(&settings, directories[10].clone(), 10).unwrap();

        let directories_latest_first: Vec<PathBuf> =
            directories[1..].iter().rev().cloned().collect();
        assert_eq!(recent_directories(&settings), directories_latest_first);
    }

    // @behavior PJ-158
    #[test]
    fn drops_a_recent_project_whose_directory_is_gone() {
        let dir = TempDir::new("pj-recent-gone");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &[]);
        open_at(&settings, lecture.clone(), 1).unwrap();
        fs::remove_dir_all(&lecture).unwrap();

        let opened_project = open_at(&settings, lecture.clone(), 2);

        assert_eq!(
            opened_project.err(),
            Some(Failure::DirectoryNotFound { directory: lecture })
        );
        assert!(recent_directories(&settings).is_empty());
    }

    // @behavior PJ-159
    #[cfg(unix)]
    #[test]
    fn keeps_a_recent_project_that_could_not_be_read() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new("pj-recent-unreadable");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &[]);
        open_at(&settings, lecture.clone(), 1).unwrap();
        fs::set_permissions(&lecture, fs::Permissions::from_mode(0o000)).unwrap();

        let opened_project = open_at(&settings, lecture.clone(), 2);

        fs::set_permissions(&lecture, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(opened_project.is_err());
        assert_eq!(recent_directories(&settings), vec![lecture]);
    }

    // @behavior PJ-160
    #[test]
    fn leaves_the_open_project_out_of_the_recent_projects() {
        let dir = TempDir::new("pj-recent-open");
        let settings = dir.path().join("settings");
        let lecture = create_directory(&dir, "lecture", &[]);
        let interview = create_directory(&dir, "interview", &[]);
        open_at(&settings, lecture.clone(), 1).unwrap();
        let current = CurrentProject::default();
        current.replace(open_at(&settings, interview, 2).unwrap());

        let recent = RecentProjects::load(&settings)
            .unwrap()
            .projects_without(current.directory().as_deref());

        assert_eq!(
            recent
                .into_iter()
                .map(|project| project.directory)
                .collect::<Vec<_>>(),
            vec![lecture]
        );
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

    #[test]
    fn tells_the_webview_the_project_changed_even_when_a_change_is_refused() {
        let app = mock_app();
        let is_heard = Arc::new(AtomicBool::new(false));
        let is_heard_by_listener = Arc::clone(&is_heard);
        ProjectChanged::listen(&app, move |_| {
            is_heard_by_listener.store(true, Ordering::SeqCst)
        });

        let result: Result<(), Failure> =
            announce_after(app.handle(), Err(Failure::ChangedElsewhere));

        assert_eq!(result, Err(Failure::ChangedElsewhere));
        assert!(is_heard.load(Ordering::SeqCst));
    }

    // @behavior MD-049
    #[test]
    fn names_the_preset_model_each_project_model_is() {
        let second_translation_preset =
            crate::toolchain::presets::slot_presets(ModelSlot::Translation)[1]
                .source
                .clone();
        let models = ProjectModels {
            transcription: Some(crate::model_source::ModelSource::File {
                path: "/models/own.bin".into(),
            }),
            translation: Some(second_translation_preset),
        };

        assert_eq!(
            project_model_presets(&models),
            ProjectModelPresets {
                transcription: None,
                translation: Some(1),
            }
        );
    }
}
