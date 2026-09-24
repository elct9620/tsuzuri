pub mod components;
pub mod models;
pub mod transcript;

#[cfg(test)]
mod test_support;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            components::component_statuses,
            components::install_components,
            models::model_settings,
            models::choose_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
