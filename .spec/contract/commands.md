# Commands

The Tauri commands the webview invokes. The frontend depends on these names and arguments, so each is kept to one implementation. A command that fails answers a Failure, never text.

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

Run the Transcribe Mode on one media file, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes, and answer the Transcript with the seconds each Phase took.

```rust
pub async fn transcribe(app: AppHandle, path: PathBuf) -> Result<Transcription, Failure> {}
```

## `open_srt`

Read an SRT file into Segments.

```rust
pub fn open_srt(path: PathBuf) -> Result<Vec<Segment>, Failure> {}
```

## `translate`

Run the Translate Mode on Segments into the target language, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes, and answer the Segments with their translations and the seconds each Phase took.

```rust
pub async fn translate(app: AppHandle, segments: Vec<Segment>, target: String) -> Result<Translation, Failure> {}
```

## `save_srt`

Write Segments to a file as SRT carrying the `original` text, the `translation`, or both as a `bilingual` SRT.

```rust
pub fn save_srt(path: PathBuf, segments: Vec<Segment>, content: SrtContent) -> Result<(), Failure> {}
```
