# Project

The one Project Rust holds as the single source of truth: what makes it, what changes it, and what refuses to run without it.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/pipeline.rs`
- `src-tauri/src/translation.rs`
- `src/controllers/project_controller.test.ts`
- `src/controllers/tabs_controller.test.ts`

## `PJ-001` Opening an SRT file as the Project

| Step | Statement |
| --- | --- |
| Given | an SRT file of two cues |
| When | it is opened |
| Then | the Project holds its two Segments and no media file |

## `PJ-002` Making a transcription the Project

| Step | Statement |
| --- | --- |
| Given | a media file |
| When | it is transcribed |
| Then | the Project holds the media file and the Segments whisper-cli wrote |

## `PJ-003` Editing a Segment of the Project

| Step | Statement |
| --- | --- |
| Given | a Project of one translated Segment |
| When | its text and its translation are edited |
| Then | the Project holds both edits |

## `PJ-004` Exporting the Project as it stands

| Step | Statement |
| --- | --- |
| Given | a Project whose Segment was edited |
| When | it is saved as SRT |
| Then | the file carries the edited text |

## `PJ-005` Refusing work without a Project

| Step | Statement |
| --- | --- |
| Given | no Project |
| When | it is translated, edited or saved |
| Then | the command fails with no Project |

## `PJ-006` Leaving a replaced Project untouched

| Step | Statement |
| --- | --- |
| Given | a Project replaced by another while it was being translated |
| When | the translation finishes |
| Then | the new Project carries none of the translations |

## `PJ-007` Opening an SRT file from the toolbar

| Step | Statement |
| --- | --- |
| Given | the toolbar |
| When | an SRT file is chosen to open |
| Then | it is opened as the Project |

## `PJ-008` Saying why an SRT file could not be opened

| Step | Statement |
| --- | --- |
| Given | the toolbar |
| When | an SRT file whose second cue is malformed is chosen to open |
| Then | a message says the file could not be read at its second cue |

## `PJ-009` Moving on to translating an opened SRT file

| Step | Statement |
| --- | --- |
| Given | the toolbar |
| When | an SRT file is opened as the Project |
| Then | the Translate tab is shown |

## `PJ-010` Recording the Languages of a translation

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` |
| When | it is translated from `ja` into `en` |
| Then | the Project's Transcript is in `ja` and its translations are in `en` |

## `PJ-011` Starting a new Project without a Translation Glossary

| Step | Statement |
| --- | --- |
| Given | a Project with a Translation Glossary |
| When | an SRT file is opened as a new Project |
| Then | the new Project holds no Translation Glossary |
