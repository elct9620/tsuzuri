# Models

Pointing each Model Slot at a Model Source, in the general settings or as a Project Model, remembering the choice, and refusing to start an engine whose Model is not there.

## Includes

- `src-tauri/src/project/files.rs`
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

## `MD-011` Saying the Models were not read

| Step | Statement |
| --- | --- |
| Given | the Settings page opening |
| When | reading the Model Slots fails |
| Then | a Notification says the settings were not read |

## `MD-012` Saying a Model was not chosen

| Step | Statement |
| --- | --- |
| Given | a Model file picked for a Model Slot |
| When | recording the choice fails |
| Then | a Notification says the settings were not saved |

## `MD-013` Reading a Model chosen before Model Sources were kept

A slot saved as a bare path keeps working after an update, so nobody chooses their Models again.

| Step | Statement |
| --- | --- |
| Given | general settings saved with a bare path for the transcription slot |
| When | the settings are loaded |
| Then | the transcription slot holds that path as a file on disk |

## `MD-014` Taking a Repository's Model from the Hugging Face Cache

| Step | Statement |
| --- | --- |
| Given | a Repository's file at a commit chosen for the transcription slot, held in the Hugging Face Cache |
| When | the transcription Model is required to start an engine |
| Then | the file's path in the Hugging Face Cache is taken |

## `MD-015` Refusing a Repository's Model the cache does not hold

| Step | Statement |
| --- | --- |
| Given | a Repository's file at a commit chosen for the translation slot, missing from the Hugging Face Cache |
| When | the translation Model is required to start an engine |
| Then | it is refused as not downloaded, naming the repository and the file |

## `MD-016` Finding the Hugging Face Cache in the home directory

| Step | Statement |
| --- | --- |
| Given | none of the Hugging Face cache variables set |
| When | the Hugging Face Cache is located |
| Then | it is `.cache/huggingface/hub` in the home directory |

## `MD-017` Taking the Hugging Face Cache a variable names

| Step | Statement |
| --- | --- |
| Given | `HF_HUB_CACHE` and `HF_HOME` both set |
| When | the Hugging Face Cache is located |
| Then | it is the directory `HF_HUB_CACHE` names |

## `MD-018` Reading a Project Model chosen before Model Sources were kept

| Step | Statement |
| --- | --- |
| Given | a Project's settings saved with a bare path as its transcription Project Model |
| When | the Project's settings are read |
| Then | its transcription Project Model is that path as a file on disk |

## `MD-019` Downloading a Repository's Model into the Hugging Face Cache

| Step | Statement |
| --- | --- |
| Given | a Hugging Face Repository serving a file at a commit |
| When | that file is downloaded |
| Then | the file lies in the Hugging Face Cache under that commit, answered as a Model Source at it |

## `MD-020` Taking a Model the cache already holds

Downloading again after an update or on a second slot costs nothing, as with any Hugging Face tool.

| Step | Statement |
| --- | --- |
| Given | a Repository's file at a commit already in the Hugging Face Cache |
| When | that file is downloaded at that commit |
| Then | no request reaches the Repository |

## `MD-021` Telling how far a download has come

| Step | Statement |
| --- | --- |
| Given | a Hugging Face Repository serving a file of known size |
| When | that file is downloaded |
| Then | progress is reported ending at its whole size |

## `MD-022` Cancelling a download

| Step | Statement |
| --- | --- |
| Given | a file of a Repository downloading |
| When | its download is cancelled |
| Then | the download answers that it was cancelled |

## `MD-023` Refusing a second download of the same file

| Step | Statement |
| --- | --- |
| Given | a file of a Repository downloading |
| When | the same file is asked to download again |
| Then | the second download is refused as already downloading |

## `MD-024` Remembering a Repository's Model for a slot

| Step | Statement |
| --- | --- |
| Given | a Repository's file at a commit, downloaded into the Hugging Face Cache |
| When | it is chosen for the transcription slot |
| Then | the transcription slot shows its path in the Hugging Face Cache |
