# Commands

The Tauri commands the webview invokes. The frontend depends on these names and arguments, so each is kept to one implementation. A command that fails answers a Failure, never text. A command that changes the Project emits `project-changed`, and the webview asks `current_project` for what it now holds.

## Includes

- `src-tauri/src/**/*.rs`

## `model_settings`

The path chosen for each Model Slot and whether its file exists.

```rust
pub fn model_settings(app: AppHandle) -> Result<ModelSettingsView, Failure> {}
```

## `choose_model`

Remember a Model file for one slot and answer the slot's new state.

```rust
pub fn choose_model(app: AppHandle, slot: ModelSlot, path: PathBuf) -> Result<ModelSettingsView, Failure> {}
```

## `component_statuses`

Whether each Component is ready to run, and where it was found. Finding them runs executables, so it runs off the main thread and the window keeps drawing meanwhile.

```rust
pub async fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, Failure> {}
```

## `choose_component`

Remember an executable for one Component and answer the statuses afterwards, found off the main thread like `component_statuses`.

```rust
pub async fn choose_component(app: AppHandle, name: String, path: PathBuf) -> Result<Vec<ComponentStatus>, Failure> {}
```

## `transcribe`

Run the Transcribe Mode on the Current Resource's media file in the Primary Language, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes and `project-changed` as each Segment arrives. The Resource's original subtitle is written from what whisper-cli wrote, refused when it exists unless `overwrite`; the answer is how long the audio is and the seconds each Phase took.

```rust
pub async fn transcribe(app: AppHandle, overwrite: bool) -> Result<Transcription, Failure> {}
```

## `open_project`

Open a directory as a new Project in the Language given for when the directory records none, and select its first Resource.

```rust
pub fn open_project(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {}
```

## `open_srt`

Open the directory an SRT file is in as a new Project, as `open_project` does, and select the file's Resource.

```rust
pub fn open_srt(app: AppHandle, path: PathBuf, language: Language) -> Result<(), Failure> {}
```

## `select_resource`

Make the Resource of this name the Current Resource, reading its subtitles from the directory.

```rust
pub fn select_resource(app: AppHandle, name: String) -> Result<(), Failure> {}
```

## `show_translation`

Show the Current Resource's translation in this Language, or none.

```rust
pub fn show_translation(app: AppHandle, language: Option<Language>) -> Result<(), Failure> {}
```

## `set_primary_language`

Make this the Project's Primary Language, record it in the Project Config, and pair the directory's subtitles again as in it.

```rust
pub fn set_primary_language(app: AppHandle, language: Language) -> Result<(), Failure> {}
```

## `current_project`

The Project's directory, Languages, Resources and Translation Glossary, with the Current Resource's Segments, or none before one is opened.

```rust
pub fn current_project(app: AppHandle) -> Option<ProjectView> {}
```

## `edit_segment`

Replace the `text` or the `translation` of one Segment of the Current Resource, by its position, and write the subtitle it belongs to back to the directory.

```rust
pub fn edit_segment(app: AppHandle, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {}
```

## `translate`

Run the Translate Mode on the Current Resource from the Primary Language into the target Language, given by its code, with the options the Translate panel offers and the saved translation settings, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes. The translations are written into the Resource and the target is recorded as the Project's translation Language; the answer is the seconds each Phase took.

```rust
pub async fn translate(app: AppHandle, target: Language, options: TranslationOptions) -> Result<Translation, Failure> {}
```

## `save_srt`

Write the Current Resource to a file as SRT carrying the `original` text, the `translation`, or both as a `bilingual` SRT.

```rust
pub fn save_srt(app: AppHandle, path: PathBuf, content: SrtContent) -> Result<(), Failure> {}
```

## `export_path`

Where an export of the Current Resource is saved by default: in the Project's directory, named after the Resource with the Language codes of the text it carries beyond the Primary Language alone.

```rust
pub fn export_path(app: AppHandle, content: SrtContent) -> Result<PathBuf, Failure> {}
```

## `translation_settings`

The saved translation settings: Batch size, retries before a failing group is split, and reference lines.

```rust
pub fn translation_settings(app: AppHandle) -> Result<TranslationSettings, Failure> {}
```

## `save_translation_settings`

Save the translation settings, each raised to at least one, and answer them as saved.

```rust
pub fn save_translation_settings(app: AppHandle, settings: TranslationSettings) -> Result<TranslationSettings, Failure> {}
```
