use tauri::State;

use super::ModeLock;

#[tauri::command]
pub fn cancel_task(mode_lock: State<'_, ModeLock>) {
    mode_lock.cancel();
}
