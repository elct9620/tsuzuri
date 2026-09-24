pub mod components;
pub mod models;
pub mod pipeline;
pub mod processes;
pub mod transcript;
pub mod translation;

#[cfg(test)]
mod test_support;

use tauri::{Manager, RunEvent};

use processes::Processes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let record = app.path().app_data_dir()?.join("processes.json");
            processes::reap_strays(&record);
            app.manage(Processes::new(record));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            components::choose_component,
            components::component_statuses,
            models::model_settings,
            models::choose_model,
            pipeline::transcribe,
            transcript::open_srt,
            transcript::save_srt,
            translation::translate
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Processes>().kill_all();
            }
        });
}
