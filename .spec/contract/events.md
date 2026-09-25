# Events

The events Rust emits to the webview. Each says only that something happened; the webview asks a command for what to show, so an event's name is all the two sides share.

## Includes

- `src-tauri/src/**/*.rs`

## Marker

`@event`

## `pipeline-progress`

The Phase a running Mode has entered, with its percentage once it has one.

## `project-changed`

The Project changed; the webview asks `current_project` for what it now holds.

## `edit-command`

Undo or Redo chosen from the Edit menu, as `"undo"` or `"redo"`: the menu takes their shortcuts before the webview sees them, so the webview applies the command to the text field holding focus, or else to the Project.
