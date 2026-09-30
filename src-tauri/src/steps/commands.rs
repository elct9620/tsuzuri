use tauri::State;

use super::ModeLock;

#[tauri::command]
#[specta::specta]
pub fn cancel_task(mode_lock: State<'_, ModeLock>) {
    mode_lock.cancel();
}
