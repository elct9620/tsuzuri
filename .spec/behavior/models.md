# Models

Pointing each Model Slot at a Model file, in the general settings or as a Project Model, remembering the choice, and refusing to start an engine whose Model is not there.

## Includes

- `src-tauri/src/toolchain.rs`
- `src-tauri/src/toolchain/*.rs`
- `src/controllers/models_controller.test.ts`
- `src/controllers/project_controller.test.ts`

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

## `MD-006` Choosing a Model in the models panel

| Step | Statement |
| --- | --- |
| Given | no Model chosen for the translation slot |
| When | the user picks a GGUF file for the translation slot in the models panel |
| Then | Rust remembers that file for the translation slot, and the slot shows its path |

## `MD-007` Taking the Project Model over the general one

A Project whose Resources need another Model keeps its own, so switching Projects never means choosing the general Model again.

| Step | Statement |
| --- | --- |
| Given | a Project Model for the transcription slot and another Model chosen in the general settings |
| When | the transcription Model is required to start an engine |
| Then | the Project Model is taken |

## `MD-008` Choosing a Project Model in the settings

| Step | Statement |
| --- | --- |
| Given | the settings of a Project without Project Models |
| When | the user picks a GGUF file for the translation slot in the Project's settings |
| Then | the Project Options are set with that file as the translation Project Model |

## `MD-009` Following the general Model without a Project Model

| Step | Statement |
| --- | --- |
| Given | a Project without a Project Model for the transcription slot |
| When | its settings show |
| Then | the transcription slot says it follows the general settings |

## `MD-010` Going back to the general Model

| Step | Statement |
| --- | --- |
| Given | the settings of a Project with a Project Model for the transcription slot |
| When | following the general settings is chosen for that slot |
| Then | the Project Options are set without a transcription Project Model |
