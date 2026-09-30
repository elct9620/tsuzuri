//! The commands and events the webview reaches, registered once so the app serves them and the
//! TypeScript bindings are generated from the same list.

use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use crate::{
    about, logs, project, steps, toolchain, transcription, translation, updates, waveform,
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
}

#[cfg(test)]
mod tests {
    use specta_typescript::Typescript;

    fn exported_bindings(name: &str) -> String {
        let path = std::env::temp_dir().join(format!("tsuzuri-{name}.ts"));
        super::builder()
            .export(Typescript::default(), &path)
            .expect("the bindings export");
        std::fs::read_to_string(path).unwrap()
    }

    #[test]
    fn exports_the_typescript_bindings() {
        let bindings = exported_bindings("exports");

        assert!(bindings.contains("export const commands"));
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
            ]
            .map(|field| bindings.contains(field)),
            [true; 6]
        );
    }
}
