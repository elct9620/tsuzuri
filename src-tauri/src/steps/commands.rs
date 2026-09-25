use tauri::{AppHandle, Manager};

use super::ModeLock;

#[tauri::command]
pub fn cancel_task(app: AppHandle) {
    app.state::<ModeLock>().cancel();
}
