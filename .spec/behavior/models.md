# Models

Pointing each Model Slot at a Model Source, in the general settings or as a Project Model, remembering the choice, and refusing to start an engine whose Model is not there.

## Includes

- `src-tauri/src/project/commands.rs`
- `src-tauri/src/project/files.rs`
- `src-tauri/src/toolchain.rs`
- `src-tauri/src/toolchain/*.rs`
- `src/components/settings/RepositoryDialog.test.ts`
- `src/components/settings/general/Models.test.ts`
- `src/components/settings/project/Models.test.ts`
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

## `MD-046` Showing the Project Model in a slot drawn after the Project

| Step | Statement |
| --- | --- |
| Given | the settings of a Project with a file as its transcription Project Model |
| When | the transcription slot is drawn again |
| Then | the slot shows that file as the Project's own Model |

## `MD-047` Keeping the other slot's Project Model when choosing one

| Step | Statement |
| --- | --- |
| Given | the settings of a Project with a Project Model for the transcription slot |
| When | a file is picked for the translation slot |
| Then | the Project Options are set with both Project Models |

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

## `MD-025` Listing the transcription Models of a Repository

A Repository keeps other files beside its Models, whisper.cpp's transcription and VAD Models are both `.bin`, and the translation and diarization Models are both `.gguf`, so only a file the slot can load is offered.

| Step | Statement |
| --- | --- |
| Given | a Repository holding `ggml-large-v3.bin`, `ggml-silero-v6.2.0.bin`, `qwen3.gguf`, `Nemotron-3-Diarization.q8_0.gguf` and `README.md` |
| When | its files are listed for the transcription slot |
| Then | only `ggml-large-v3.bin` is listed, with its size |

## `MD-026` Listing the VAD Models of a Repository

| Step | Statement |
| --- | --- |
| Given | a Repository holding `ggml-large-v3.bin`, `ggml-silero-v6.2.0.bin`, `qwen3.gguf`, `Nemotron-3-Diarization.q8_0.gguf` and `README.md` |
| When | its files are listed for the VAD slot |
| Then | only `ggml-silero-v6.2.0.bin` is listed |

## `MD-027` Listing the translation Models of a Repository

| Step | Statement |
| --- | --- |
| Given | a Repository holding `ggml-large-v3.bin`, `ggml-silero-v6.2.0.bin`, `qwen3.gguf`, `Nemotron-3-Diarization.q8_0.gguf` and `README.md` |
| When | its files are listed for the translation slot |
| Then | only `qwen3.gguf` is listed |

## `MD-028` Picking a Model file by the slot's extensions

| Step | Statement |
| --- | --- |
| Given | the models panel loaded |
| When | the user picks a file for the translation slot |
| Then | the file dialog offers the extensions Rust names for the translation slot |

## `MD-029` Offering only Preset Models their slot can load

| Step | Statement |
| --- | --- |
| Given | the Preset Models |
| When | each is checked against its Model Slot |
| Then | every one is a file its Model Slot can load, and every Model Slot has one |

## `MD-030` Pinning every Preset Model at a commit

A Preset Model is what Tsuzuri was verified with, so a Repository changing its files later does not change what is downloaded.

| Step | Statement |
| --- | --- |
| Given | the Preset Models |
| When | their Model Sources are read |
| Then | every one names a Repository's file at a full commit hash |

## `MD-031` Offering a slot's Preset Models

| Step | Statement |
| --- | --- |
| Given | Preset Models for the transcription and the translation slots |
| When | the transcription slot's Preset Models are asked for |
| Then | Rust answers only the transcription Preset Models, in the order the settings offer them |

## `MD-032` Downloading a Preset Model before choosing it

The slot keeps its Model until the download is done, so a cancelled or failed download leaves nothing half chosen.

| Step | Statement |
| --- | --- |
| Given | the translation slot's menu |
| When | the user picks a Preset Model from it |
| Then | the Preset Model is downloaded at its commit, then chosen for the translation slot |

## `MD-033` Showing how far a Model's download has come

| Step | Statement |
| --- | --- |
| Given | a Preset Model downloading for the transcription slot |
| When | half of its file has arrived |
| Then | the slot shows the download at 50% |

## `MD-034` Cancelling a download from its slot

| Step | Statement |
| --- | --- |
| Given | a Preset Model downloading for the transcription slot |
| When | the user cancels it in that slot |
| Then | Rust is asked to stop downloading that file |

## `MD-035` Keeping the Model when its download fails

| Step | Statement |
| --- | --- |
| Given | the translation slot holding a file on disk |
| When | the download of a Preset Model picked for it fails |
| Then | the slot's menu shows the file on disk again |

## `MD-036` Naming a Model no Preset Model is

| Step | Statement |
| --- | --- |
| Given | the translation slot holding a file on disk |
| When | its menu is shown |
| Then | the menu names the file as the slot's own choice |

## `MD-037` Listing a Repository's files for a slot

| Step | Statement |
| --- | --- |
| Given | the Repository dialog open for the translation slot |
| When | the user lists the files of a Repository |
| Then | the Model files Rust answers for the translation slot are offered with their sizes |

## `MD-038` Downloading the file picked from a Repository

| Step | Statement |
| --- | --- |
| Given | a Repository's files listed in the Repository dialog for the translation slot |
| When | the user picks one and downloads it |
| Then | that file is downloaded, then chosen for the translation slot |

## `MD-039` Saying why a Repository was not listed

| Step | Statement |
| --- | --- |
| Given | the Repository dialog open |
| When | listing a Repository's files fails |
| Then | the dialog says why |

## `MD-040` Choosing a Preset Model as a Project Model

| Step | Statement |
| --- | --- |
| Given | the settings of a Project without Project Models |
| When | the user picks a Preset Model for its translation slot |
| Then | the Project Options are set with the downloaded Preset Model as the translation Project Model |

## `MD-041` Asking to download a Model the cache lost

| Step | Statement |
| --- | --- |
| Given | the transcription slot holding a Repository's file the Hugging Face Cache no longer holds |
| When | the models panel loads |
| Then | the transcription slot asks the user to download it again |

## `MD-042` Reading the token Hugging Face's tools saved

A Repository that needs a login is downloaded with the token `hf auth login` saved, so Tsuzuri keeps no secret of its own.

| Step | Statement |
| --- | --- |
| Given | none of the Hugging Face token variables set, and a token saved under `.cache/huggingface` in the home directory |
| When | the Hugging Face token is looked for |
| Then | the saved token is taken |

## `MD-043` Taking the token `HF_TOKEN` names

| Step | Statement |
| --- | --- |
| Given | `HF_TOKEN` set, and a token saved under `.cache/huggingface` in the home directory |
| When | the Hugging Face token is looked for |
| Then | the token `HF_TOKEN` names is taken |

## `MD-044` Asking to log in for a gated Repository

| Step | Statement |
| --- | --- |
| Given | a Hugging Face Repository answering that it is gated |
| When | one of its files is downloaded |
| Then | it is refused as needing a login, naming the Repository |

## `MD-045` Saying a Repository was not found

The Hub answers a Repository that does not exist, or is private to someone else, as unauthorized without saying which.

| Step | Statement |
| --- | --- |
| Given | a Hugging Face Repository answering unauthorized without an error code |
| When | its files are listed |
| Then | it is refused as not found, naming the Repository |

## `MD-048` Grouping a slot's Preset Models by name

| Step | Statement |
| --- | --- |
| Given | the transcription slot's Preset Models of two families |
| When | its menu is shown |
| Then | the menu groups them by name, in the order Rust answers them |

## `MD-049` Naming which Preset Model a slot's Model is

| Step | Statement |
| --- | --- |
| Given | the translation slot holding a Preset Model, in the general settings and as a Project Model |
| When | the Model Settings and the Project are viewed |
| Then | each names that Preset Model's place among the slot's Preset Models, while a file on disk names none |

## `MD-050` Choosing the Preset Model Rust names in a slot's menu

| Step | Statement |
| --- | --- |
| Given | the translation slot whose Model Rust names as its first Preset Model |
| When | its menu is shown |
| Then | the menu has that Preset Model chosen |

## `MD-051` Listing the diarization Models of a Repository

| Step | Statement |
| --- | --- |
| Given | a Repository holding `ggml-large-v3.bin`, `ggml-silero-v6.2.0.bin`, `qwen3.gguf`, `Nemotron-3-Diarization.q8_0.gguf` and `README.md` |
| When | its files are listed for the diarization slot |
| Then | only `Nemotron-3-Diarization.q8_0.gguf` is listed |

## `MD-052` Picking no Model file while the settings cannot be read

A Model file is offered by the extensions its slot takes, so with no settings to name them no file is offered.

| Step | Statement |
| --- | --- |
| Given | the Model settings cannot be read |
| When | the user picks a file for a slot, in the general settings or as a Project Model |
| Then | no file dialog opens and the slot keeps its Model |
