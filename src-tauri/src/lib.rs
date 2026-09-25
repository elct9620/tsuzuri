pub mod components;
pub mod failure;
pub mod history;
pub mod language;
pub mod models;
pub mod pipeline;
pub mod processes;
pub mod project;
pub mod project_config;
pub mod resource;
pub mod segment_change;
pub mod timing;
pub mod transcript;
pub mod translation;
pub mod translation_glossary;
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
                project::read_again_if_changed(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            components::choose_component,
            components::forget_component,
            components::component_statuses,
            models::model_settings,
            models::choose_model,
            pipeline::transcribe,
            project::current_project,
            project::edit_segment,
            project::change_segments,
            project::export_path,
            project::open_project,
            project::open_srt,
            project::save_srt,
            project::select_resource,
            project::set_primary_language,
            project::set_project_options,
            project::show_translation,
            translation::save_translation_settings,
            translation::translate,
            translation::translation_settings,
            translation_glossary::save_translation_glossary,
            translation_glossary::translation_glossary_table,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Processes>().kill_all();
            }
        });
}
