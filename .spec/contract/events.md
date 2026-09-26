# Events

The events Rust emits to the webview. Each says only that something happened; the webview asks a command for what to show, so an event's name is all the two sides share.

## Includes

- `src-tauri/src/**/*.rs`

## Marker

`@event`

## `pipeline-progress`

The Phase a running Mode has entered, with its percentage once it has one and, when the Phase counts what it works through, how many it has done of how many.

## `project-changed`

The Project changed; the webview asks `current_project` for what it now holds.

## `changed-elsewhere-kept`

A subtitle of the Current Resource was changed elsewhere and read again as the Project was reloaded, and what Tsuzuri last held of it was kept as an Overwrite Backup; the webview tells the user where to find it.

## `edit-command`

Undo, Redo or Select All chosen from the Edit menu, as `"undo"`, `"redo"` or `"select-all"`: the menu takes their shortcuts before the webview sees them, so the webview applies the command to the text field holding focus, or else to the Project, where Select All checks every Segment.
