# Models

Pointing each Model Slot at a Model file, remembering the choice, and refusing to start an engine whose Model is not there.

## Includes

- `src-tauri/src/models.rs`
- `src/controllers/models_controller.test.ts`

## `MD-001` Remembering a chosen Model

| Step | Statement |
| --- | --- |
| Given | a Model file chosen for the transcription slot |
| When | the settings are loaded again from the same app data |
| Then | the transcription slot holds that file's path |

## `MD-002` Refusing a slot with no Model chosen

| Step | Statement |
| --- | --- |
| Given | no Model chosen for the translation slot |
| When | the translation Model is required to start an engine |
| Then | it is refused as not chosen |

## `MD-003` Refusing a Model file that is gone

| Step | Statement |
| --- | --- |
| Given | a Model chosen for the transcription slot whose file was since deleted |
| When | the transcription Model is required to start an engine |
| Then | it is refused as missing, naming the path |

## `MD-004` Showing the chosen Model

| Step | Statement |
| --- | --- |
| Given | a Model chosen for the transcription slot whose file exists |
| When | the models panel loads |
| Then | the transcription slot shows the file's path |

## `MD-005` Asking again for a missing Model

| Step | Statement |
| --- | --- |
| Given | a Model chosen for the translation slot whose file was since deleted |
| When | the models panel loads |
| Then | the translation slot asks the user to choose the file again |
