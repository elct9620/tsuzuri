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

Run the Transcribe Mode on one media file, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes. The media file and its Transcript become the Project; the answer is how long the audio is and the seconds each Phase took.

```rust
pub async fn transcribe(app: AppHandle, path: PathBuf) -> Result<Transcription, Failure> {}
```

## `open_srt`

Read an SRT file into a new Project with no media file.

```rust
pub fn open_srt(app: AppHandle, path: PathBuf) -> Result<(), Failure> {}
```

## `current_project`

The Project's media file and Segments, or none before one is made.

```rust
pub fn current_project(app: AppHandle) -> Option<ProjectView> {}
```

## `edit_segment`

Replace the `text` or the `translation` of one Segment of the Project, by its position.

```rust
pub fn edit_segment(app: AppHandle, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {}
```

## `translate`

Run the Translate Mode on the Project into the target Language, given by its code, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes. The translations are written into the Project; the answer is the seconds each Phase took.

```rust
pub async fn translate(app: AppHandle, target: Language) -> Result<Translation, Failure> {}
```

## `save_srt`

Write the Project to a file as SRT carrying the `original` text, the `translation`, or both as a `bilingual` SRT.

```rust
pub fn save_srt(app: AppHandle, path: PathBuf, content: SrtContent) -> Result<(), Failure> {}
```
