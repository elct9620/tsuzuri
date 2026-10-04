use serde::Serialize;
use tauri_specta::Event;

/// Undo, Redo, Select All or Clean Simplified Chinese chosen from the Edit menu, which takes their
/// shortcuts before the webview sees them; the webview knows what each applies to.
// @event edit-command
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type, Event)]
#[serde(rename_all = "kebab-case")]
#[tauri_specta(event_name = "edit-command")]
pub enum EditCommand {
    Undo,
    Redo,
    SelectAll,
    CleanSimplified,
}
