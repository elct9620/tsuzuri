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

## `forget_component`

Forget the executable chosen for one Component, so it is found again by Detection or as a Bundled Variant, and answer the statuses afterwards like `choose_component`.

```rust
pub async fn forget_component(app: AppHandle, name: String) -> Result<Vec<ComponentStatus>, Failure> {}
```

## `transcribe`

Run the Transcribe Mode on the Current Resource's media file in the Primary Language, with the Project's Transcription Settings and Project Model where it sets them and the general ones elsewhere, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes and `project-changed` as each Segment arrives. The Resource's original subtitle is written from what whisper-cli wrote, refused when it exists unless `overwrite`, and each cue of its translations that has the times of a cue written takes that cue's Speaker; the answer is how long the audio is and the seconds each Phase took.

```rust
pub async fn transcribe(app: AppHandle, current: State<'_, CurrentProject>, mode_lock: State<'_, ModeLock>, processes: State<'_, Processes>, resident: State<'_, ResidentLlama>, overwrite: bool) -> Result<Transcription, Failure> {}
```

## `transcription_settings`

The general Transcription Settings: whether VAD runs, whether non-speech tokens are suppressed, and whether each window carries the text before it as context.

```rust
pub fn transcription_settings(app: AppHandle) -> Result<TranscriptionSettings, Failure> {}
```

## `save_transcription_settings`

Save the general Transcription Settings and answer them as saved.

```rust
pub fn save_transcription_settings(app: AppHandle, settings: TranscriptionSettings) -> Result<TranscriptionSettings, Failure> {}
```

## `extract_waveform`

The Waveform of the Current Resource's media, with the media file it was taken from so an answer that arrives after another Resource was selected can be told apart. ffmpeg runs as a Step outside any Mode, so a running Mode does not delay it.

```rust
pub async fn extract_waveform(app: AppHandle, current: State<'_, CurrentProject>, processes: State<'_, Processes>) -> Result<Waveform, Failure> {}
```

## `open_project`

Open a directory as a new Project in the Language given for when the directory records none, and select its first Resource. The webview may read the files of that directory from then on, so the Preview can load its media.

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
pub fn select_resource(app: AppHandle, current: State<'_, CurrentProject>, name: String) -> Result<(), Failure> {}
```

## `show_translation`

Show the Current Resource's translation in this Language, or none.

```rust
pub fn show_translation(app: AppHandle, current: State<'_, CurrentProject>, language: Option<Language>) -> Result<(), Failure> {}
```

## `reload_project`

Pair the Project's files again and read the Current Resource again from them, showing the same translation while its file is there, or the first Resource once the Current Resource is gone. The Undo History is kept unless a subtitle of the Current Resource was changed elsewhere. While a Mode runs on the Current Resource only the Resource list is read again. Emits `project-changed`.

```rust
pub fn reload_project(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {}
```

## `set_primary_language`

Make this the Project's Primary Language, record it in the Project Config, and pair the directory's subtitles again as in it.

```rust
pub fn set_primary_language(app: AppHandle, current: State<'_, CurrentProject>, language: Language) -> Result<(), Failure> {}
```

## `set_project_options`

Replace the Project Options and record them in the Project Config.

```rust
pub fn set_project_options(app: AppHandle, current: State<'_, CurrentProject>, options: ProjectOptions) -> Result<(), Failure> {}
```

## `current_project`

The Project's directory, Languages, Project Options, Resources and Translation Glossary with the Speakers it names in the Primary Language, with the Current Resource's Segments, whether it has a change to undo and to redo, the Mode running on it and the Batch it is translating, or none before one is opened.

```rust
pub fn current_project(current: State<'_, CurrentProject>) -> Option<ProjectView> {}
```

## `edit_segment`

Replace the `text`, the `translation` or the `speaker` of one Segment of the Current Resource, by its position, where an empty `speaker` leaves it with none, and write the subtitle it belongs to back to the directory; a Speaker is written to the original and to each cue of every translation that has the Segment's times. When a subtitle of the Current Resource was changed elsewhere since Tsuzuri last read or wrote it, the edit is not made: the Current Resource is read again, `project-changed` is emitted, and the answer is the `changed-elsewhere` Failure. An edit of a subtitle a running Mode writes is refused as `mode-running`.

```rust
pub fn edit_segment(app: AppHandle, current: State<'_, CurrentProject>, index: usize, field: SegmentField, value: String) -> Result<(), Failure> {}
```

## `set_speakers`

Give each Segment of the Current Resource at `indexes` the Speaker `speaker`, where an empty one leaves them with none, as one change in the Undo History; the Speakers are written as `edit_segment` writes one, to the original and to each cue of every translation that has a Segment's times. A subtitle changed elsewhere and a running Mode are refused as `edit_segment` refuses them, and a position the Segments do not have is refused before anything is written.

```rust
pub fn set_speakers(app: AppHandle, indexes: Vec<usize>, speaker: String) -> Result<(), Failure> {}
```

## `cancel_task`

Ask the running transcription or translation to stop. It stops at once, ending the Components it started, and answers the `mode-cancelled` Failure; nothing more is written, and what it showed gives way to what the files hold, emitting `project-changed`. With no task running it changes nothing.

```rust
pub fn cancel_task(mode_lock: State<'_, ModeLock>) {}
```

## `retranslate`

Translate the Current Resource's Segments at `indexes` again, into the translation shown, as one Batch carrying the translated lines before them and the source lines after them; no Split Sentences are searched for and no Rolling Summary is kept. The translations are written as one change in the Undo History, with no Backup, and the answer is how long each Phase took. With no translation shown it is refused as `no-translation-shown`; it runs, waits and can be cancelled as `translate` does.

```rust
pub async fn retranslate(app: AppHandle, current: State<'_, CurrentProject>, indexes: Vec<usize>) -> Result<Translation, Failure> {}
```

## `translate`

Run the Translate Mode on the Current Resource from the Primary Language into the target Language, given by its code, with the options the Translate panel offers, the saved translation settings and the Project Model where the Project has one, emitting a `pipeline-progress` event as each Phase starts and as its percentage changes. Each Batch's translations are shown as it finishes, emitting `project-changed`; once all are done they are written to the Resource's translation file and the target is recorded as the Project's translation Language; the answer is the seconds each Phase took.

```rust
pub async fn translate(app: AppHandle, target: Language, options: TranslationOptions) -> Result<Translation, Failure> {}
```

## `save_srt`

Write the Current Resource to a file as SRT carrying the `original` text, the `translation`, or both as a `bilingual` SRT.

```rust
pub fn save_srt(current: State<'_, CurrentProject>, path: PathBuf, content: SrtContent) -> Result<(), Failure> {}
```

## `change_segments`

Make a Segment Change to the Current Resource, by position, and write its original and every translation back to the directory, together with the Bilingual SRTs the Project Options keep. A Segment that would end before it starts is refused as `invalid-times`; a subtitle changed elsewhere is handled as `edit_segment` handles it, and one a running Mode writes is refused as `mode-running`.

```rust
pub fn change_segments(app: AppHandle, current: State<'_, CurrentProject>, change: SegmentChange) -> Result<(), Failure> {}
```

## `subtitle_versions`

The Backups of each subtitle of the Current Resource, its original first and then each translation, newest Backup first, each saying whether it is an Output or an Overwrite.

```rust
pub fn subtitle_versions(current: State<'_, CurrentProject>) -> Result<Vec<SubtitleVersions>, Failure> {}
```

## `compare_versions`

Two Versions of the Current Resource's original, or of its translation into `language`, as Comparison Rows in time order, a Version being a Backup by file name or, as none, the subtitle now; `left` is the earlier of the two as given.

```rust
pub fn compare_versions(current: State<'_, CurrentProject>, language: Option<Language>, left: Option<String>, right: Option<String>) -> Result<Vec<ComparedRow>, Failure> {}
```

## `translation_cues`

The cues of the Current Resource's translation into `language` as its file is written, for reading beside the cues being edited; none when there is no such translation.

```rust
pub fn translation_cues(current: State<'_, CurrentProject>, language: Language) -> Result<Vec<ComparedCue>, Failure> {}
```

## `restore_version`

Keep the subtitle as an Overwrite Backup, then put the named Backup in its place and read the Current Resource again, emitting `project-changed`. A name the subtitle's Backups do not hold is refused as `no-backup`. A subtitle a running Mode writes is refused as `mode-running`. It answers how many Segments of the original, restored with times they did not have, find no cue at those times in one of the translations.

```rust
pub fn restore_version(app: AppHandle, language: Option<Language>, backup: String) -> Result<Restoration, Failure> {}
```

## `undo`

Put the Current Resource's subtitles back as they were before its latest change in the Undo History, write them to the directory with the Bilingual SRTs they feed, and read the Current Resource again, emitting `project-changed`. With nothing to undo it changes nothing; while a Mode runs on the Current Resource it is refused as `mode-running`.

```rust
pub fn undo(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {}
```

## `redo`

Make the Current Resource's latest undone change again, as `undo` puts one back. With nothing to redo it changes nothing.

```rust
pub fn redo(app: AppHandle, current: State<'_, CurrentProject>) -> Result<(), Failure> {}
```

## `revert_row`

Take back one Comparison Row of the named Backup against the Current Resource's original, or its translation into `language`, as they compare now: for a Pair its `text`, its `times`, or the `whole` cue; for any other row the whole of it, putting back the Backup's cues in place of the subtitle's. Only that subtitle is written, with the Bilingual SRTs it feeds, as one change in the Undo History, emitting `project-changed`. A row the comparison does not have is refused as `no-row`, a Backup the subtitle does not have as `no-backup`, and a subtitle a running Mode writes as `mode-running`. It answers as `restore_version` does.

```rust
pub fn revert_row(app: AppHandle, language: Option<Language>, backup: String, row: usize, part: RevertPart) -> Result<Restoration, Failure> {}
```

## `export_path`

Where an export of the Current Resource is saved by default: in the Project's directory, named after the Resource with the Language codes of the text it carries beyond the Primary Language alone, a Bilingual SRT's in its Bilingual Order.

```rust
pub fn export_path(current: State<'_, CurrentProject>, content: SrtContent) -> Result<PathBuf, Failure> {}
```

## `translation_settings`

The saved translation settings: Batch size, retries before a failing group is split, and reference lines.

```rust
pub fn translation_settings(app: AppHandle) -> Result<TranslationSettings, Failure> {}
```

## `save_translation_settings`

Save the translation settings, each raised to at least one, and answer them as saved.

```rust
pub async fn save_translation_settings(app: AppHandle, mode_lock: State<'_, ModeLock>, processes: State<'_, Processes>, resident: State<'_, ResidentLlama>, settings: TranslationSettings) -> Result<TranslationSettings, Failure> {}
```

## `translation_glossary_table`

The Project's Translation Glossary as a table: a column for every Language, a row for every term holding its words and whether it names a Speaker, and whether its file has a `source,target` header; an empty table when the Project has no `glossary.csv`.

```rust
pub fn translation_glossary_table(current: State<'_, CurrentProject>) -> Result<GlossaryTable, Failure> {}
```

## `save_translation_glossary`

Write `rows`, each holding a word for every Language in the order the table gave them and whether it names a Speaker, to the Project's `glossary.csv` with a header of Language codes and `type`, leaving out empty rows and creating the file when there is none; the Project then holds the Translation Glossary as saved and `project-changed` is emitted.

```rust
pub fn save_translation_glossary(app: AppHandle, current: State<'_, CurrentProject>, rows: Vec<GlossaryRow>) -> Result<(), Failure> {}
```

## `log_directory`

The directory the log is written to in this launch, and the one chosen for the next.

```rust
pub fn log_directory(app: AppHandle, log_dir: State<'_, LogDirInUse>) -> Result<LogDirectory, Failure> {}
```

## `choose_log_directory`

Record `path` as the directory to write the log to from the next launch, and answer both directories as `log_directory` does.

```rust
pub fn choose_log_directory(app: AppHandle, log_dir: State<'_, LogDirInUse>, path: PathBuf) -> Result<LogDirectory, Failure> {}
```

## `open_log_directory`

Open the directory the log is written to in this launch with the system's file manager.

```rust
pub fn open_log_directory(log_dir: State<'_, LogDirInUse>) -> Result<(), Failure> {}
```

