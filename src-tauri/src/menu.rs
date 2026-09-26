use tauri::menu::{Menu, MenuEvent, MenuItem};
use tauri::{AppHandle, Emitter, Runtime};

const UNDO_ID: &str = "undo";
const REDO_ID: &str = "redo";
const SELECT_ALL_ID: &str = "select-all";

/// The menu Tauri makes on macOS, with Undo, Redo and Select All of its own: the menu takes their
/// shortcuts before the webview sees them, so these hand the command to the webview, which knows
/// whether it belongs to the text field in focus or to the Project.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    for item in menu.items()? {
        let Some(edit) = item
            .as_submenu()
            .filter(|submenu| submenu.text().is_ok_and(|text| text == "Edit"))
        else {
            continue;
        };
        edit.remove_at(0)?;
        edit.remove_at(0)?;
        edit.insert(
            &MenuItem::with_id(app, UNDO_ID, "Undo", true, Some("CmdOrCtrl+Z"))?,
            0,
        )?;
        edit.insert(
            &MenuItem::with_id(app, REDO_ID, "Redo", true, Some("CmdOrCtrl+Shift+Z"))?,
            1,
        )?;
        let select_all_position = edit.items()?.len() - 1;
        edit.remove_at(select_all_position)?;
        edit.insert(
            &MenuItem::with_id(app, SELECT_ALL_ID, "Select All", true, Some("CmdOrCtrl+A"))?,
            select_all_position,
        )?;
    }
    Ok(menu)
}

/// Sends Undo, Redo or Select All chosen from the menu on to the webview.
pub fn forward_edit_command<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let command = event.id().0.as_str();
    if matches!(command, UNDO_ID | REDO_ID | SELECT_ALL_ID) {
        // @event edit-command
        let _ = app.emit("edit-command", command);
    }
}
