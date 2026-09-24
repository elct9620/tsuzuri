# Commands

The Tauri commands the webview invokes. The frontend depends on these names and arguments, so each is kept to one implementation.

## Includes

- `src-tauri/src/**/*.rs`

## `model_settings`

The path chosen for each Model Slot and whether its file exists.

```rust
pub fn model_settings(app: AppHandle) -> Result<ModelSettingsView, String> {}
```

## `choose_model`

Remember a Model file for one slot and answer the slot's new state.

```rust
pub fn choose_model(app: AppHandle, slot: ModelSlot, path: PathBuf) -> Result<ModelSettingsView, String> {}
```

## `component_statuses`

Whether each Component the Manifest lists for this platform is ready to run.

```rust
pub fn component_statuses(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {}
```

## `install_components`

Install every downloaded Component that is not ready yet, one after another, emitting `component-progress` events while archives download, and answer the statuses afterwards.

```rust
pub async fn install_components(app: AppHandle) -> Result<Vec<ComponentStatus>, String> {}
```

## `transcribe`

Run the Transcribe Mode on one media file, emitting `pipeline-progress` events, and answer the Transcript with its timing.

```rust
pub async fn transcribe(app: AppHandle, path: PathBuf) -> Result<Transcription, String> {}
```

## `open_srt`

Read an SRT file into Segments.

```rust
pub fn open_srt(path: PathBuf) -> Result<Vec<Segment>, String> {}
```

## `translate`

Run the Translate Mode on Segments into the target language, emitting `pipeline-progress` events, and answer the Segments with their translations.

```rust
pub async fn translate(app: AppHandle, segments: Vec<Segment>, target: String) -> Result<Vec<TranslatedSegment>, String> {}
```
