//! The commands and events the webview reaches, registered once so the app serves them and the
//! TypeScript bindings are generated from the same list.

use tauri_specta::{collect_commands, collect_events, Builder, ErrorHandlingMode, Events};

use crate::edit_command::EditCommand;
use crate::{
    about, logs, progress, project, steps, toolchain, transcription, translation, updates,
    waveform, window,
};

/// A command that fails rejects with its `Failure`, as a plain `invoke` does, and the counts and
/// sizes the webview reads stay `number`, since none of them reaches past what a double holds.
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .dangerously_cast_bigints_to_number()
        .commands(collect_commands![
            waveform::commands::extract_waveform,
            toolchain::commands::choose_component,
            toolchain::commands::forget_component,
            toolchain::commands::component_statuses,
            toolchain::commands::model_settings,
            toolchain::commands::choose_model,
            toolchain::commands::preset_models,
            toolchain::commands::download_model,
            toolchain::commands::repository_files,
            toolchain::commands::cancel_model_download,
            transcription::commands::transcribe,
            transcription::commands::transcription_settings,
            transcription::commands::save_transcription_settings,
            project::commands::current_project,
            project::commands::edit_segment,
            project::commands::set_speakers,
            project::commands::replace_text,
            project::commands::clean_simplified,
            project::commands::find_text,
            steps::commands::cancel_task,
            translation::commands::retranslate,
            project::commands::change_segments,
            project::commands::translation_cues,
            logs::commands::log_directory,
            logs::commands::choose_log_directory,
            logs::commands::debug_log,
            logs::commands::choose_debug_log,
            logs::commands::open_log_directory,
            about::commands::app_build,
            about::commands::open_releases,
            about::commands::open_sponsorship,
            updates::commands::check_for_update,
            updates::commands::check_for_update_at_launch,
            updates::commands::install_update,
            updates::commands::update_settings,
            updates::commands::choose_launch_check,
            updates::commands::choose_update_channel,
            updates::commands::check_for_rollback,
            project::commands::revert_row,
            project::commands::undo,
            project::commands::redo,
            project::commands::subtitle_versions,
            project::commands::compare_versions,
            project::commands::restore_version,
            project::commands::export_path,
            project::commands::open_project,
            project::commands::open_srt,
            project::commands::recent_projects,
            project::commands::take_requested_srt,
            project::commands::save_srt,
            project::commands::save_text,
            project::commands::select_resource,
            project::commands::set_primary_language,
            project::commands::set_project_options,
            project::commands::show_translation,
            project::commands::reload_project,
            translation::commands::save_translation_settings,
            translation::commands::translate,
            translation::commands::translation_settings,
            project::commands::save_translation_glossary,
            project::commands::translation_glossary_table,
        ])
        .events(events())
}

/// The events Rust emits, apart from any runtime so the tests' apps can mount them too.
pub fn events() -> Events {
    collect_events![
        progress::ProjectChanged,
        progress::PipelineProgress,
        EditCommand,
        project::commands::ChangedElsewhereKept,
        project::commands::SrtRequested,
        window::VideoWindowClosing,
        updates::commands::AppUpdateProgress,
        toolchain::commands::ModelDownloadProgress,
    ]
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use specta_typescript::Typescript;

    fn exported_bindings(name: &str) -> String {
        let path = std::env::temp_dir().join(format!("tsuzuri-{name}.ts"));
        super::builder()
            .export(
                Typescript::default().header(
                    "// Generated from the Rust commands and events by `cargo test bindings`; change those instead.",
                ),
                &path,
            )
            .expect("the bindings export");
        fs::read_to_string(path).unwrap()
    }

    // The webview is type-checked against the committed file, so a change to a command or an event
    // rewrites it here and fails once, leaving the new file to commit.
    #[test]
    fn keeps_the_webview_bindings_current() {
        let bindings = exported_bindings("current");
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/backend/bindings.ts");
        let committed = fs::read_to_string(&path).unwrap_or_default();

        if committed != bindings {
            fs::write(&path, &bindings).unwrap();
        }

        assert!(
            committed == bindings,
            "src/backend/bindings.ts was out of date and is now rewritten; commit it"
        );
    }

    #[test]
    fn types_fields_as_rust_sends_them() {
        let bindings = exported_bindings("fields");

        assert_eq!(
            [
                "\tpeaks: number[],",
                "\tseconds: number,",
                "\taudio_seconds: number,",
                "\ttranscribe_seconds: number,",
                "\tspeaker?: string,",
                "\ttranslation?: string,",
                "\tcount?: Count,",
            ]
            .map(|field| bindings.contains(field)),
            [true; 7]
        );
    }

    // The webview relays each event by the name the events contract gives it.
    #[test]
    fn names_each_event_as_the_contract_does() {
        let bindings = exported_bindings("events");

        assert_eq!(
            [
                "project-changed",
                "pipeline-progress",
                "edit-command",
                "changed-elsewhere-kept",
                "srt-requested",
                "video-window-closing",
                "update-progress",
                "model-download-progress",
            ]
            .map(|name| bindings.contains(&format!(">(\"{name}\")"))),
            [true; 8]
        );
    }
}
