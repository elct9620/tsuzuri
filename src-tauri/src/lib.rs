pub mod components;
pub mod failure;
pub mod language;
pub mod models;
pub mod pipeline;
pub mod processes;
pub mod project;
pub mod timing;
pub mod transcript;
pub mod translation;
pub mod translation_glossary;

#[cfg(test)]
mod test_support;

use tauri::{Manager, RunEvent};
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
        .setup(|app| {
            let record = app.path().app_data_dir()?.join("processes.json");
            processes::reap_strays(&record);
            app.manage(Processes::new(record));
            app.manage(CurrentProject::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            components::choose_component,
            components::component_statuses,
            models::model_settings,
            models::choose_model,
            pipeline::transcribe,
            project::current_project,
            project::edit_segment,
            project::open_srt,
            project::save_srt,
            translation::translate,
            translation_glossary::clear_glossary,
            translation_glossary::load_glossary
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Processes>().kill_all();
            }
        });
}
