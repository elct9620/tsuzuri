pub mod components;
pub mod failure;
pub mod language;
pub mod models;
pub mod processes;
pub mod progress;
pub mod project;
pub mod segment_change;
pub mod steps;
pub mod timing;
pub mod transcript;
pub mod transcription;
pub mod translation;
pub mod window;

#[cfg(test)]
mod test_support;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, TimezoneStrategy};

use processes::Processes;
use project::CurrentProject;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .timezone_strategy(TimezoneStrategy::UseLocal)
                // Room for several whole runs, so the slow one is still there when someone looks.
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let record = app.path().app_data_dir()?.join("processes.json");
            processes::reap_strays(&record);
            app.manage(Processes::new(record));
            app.manage(CurrentProject::default());
            window::size_first_window(app)?;
            Ok(())
        })
        // A subtitle may have been corrected in another program while the window was away
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(true) = event {
                project::commands::read_again_if_changed(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            components::choose_component,
            components::forget_component,
            components::component_statuses,
            models::model_settings,
            models::choose_model,
            transcription::commands::transcribe,
            project::commands::current_project,
            project::commands::edit_segment,
            project::commands::change_segments,
            project::commands::subtitle_versions,
            project::commands::compare_versions,
            project::commands::restore_version,
            project::commands::export_path,
            project::commands::open_project,
            project::commands::open_srt,
            project::commands::save_srt,
            project::commands::select_resource,
            project::commands::set_primary_language,
            project::commands::set_project_options,
            project::commands::show_translation,
            translation::commands::save_translation_settings,
            translation::commands::translate,
            translation::commands::translation_settings,
            project::commands::save_translation_glossary,
            project::commands::translation_glossary_table,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Processes>().kill_all();
            }
        });
}
