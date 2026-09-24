# Project

The directory Rust holds open as the single source of truth: which files make its Resources, which Resource is current, what changes it, and what refuses to run without it.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/resource.rs`
- `src-tauri/src/pipeline.rs`
- `src-tauri/src/translation.rs`
- `src/controllers/project_controller.test.ts`
- `src/controllers/tabs_controller.test.ts`
- `src/controllers/transcript_controller.test.ts`

## `PJ-001` Opening a directory as the Project

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.mp4`, `ep01.srt` and `ep02.mp4` |
| When | it is opened |
| Then | the Project lists the Resources `ep01` and `ep02` |

## `PJ-015` Selecting the first Resource of an opened directory

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep02.srt` and `ep01.srt` |
| When | it is opened |
| Then | the Current Resource is `ep01` and the Project holds its Segments |

## `PJ-016` Taking a subtitle named by the Primary Language as the original

| Step | Statement |
| --- | --- |
| Given | a directory holding only `ep01.zh-TW.srt` |
| When | it is opened in `zh-TW` |
| Then | `ep01` holds the Segments of `ep01.zh-TW.srt` and no translation |

## `PJ-017` Preferring the subtitle without a Language code

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.srt` and `ep01.zh-TW.srt` with different text |
| When | it is opened in `zh-TW` |
| Then | `ep01` holds the Segments of `ep01.srt` |

## `PJ-018` Leaving out a bilingual export and an unknown Language code

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.srt`, `ep01.zh-TW.en.srt` and `ep01.ko.srt` |
| When | it is opened in `zh-TW` |
| Then | the Project lists only `ep01`, with no translation |

## `PJ-019` Loading a translation by the times of its cues

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.srt` of two cues and `ep01.en.srt` of one cue at the first cue's times |
| When | it is opened in `zh-TW` |
| Then | the first Segment is translated from `ep01.en.srt` and the second is not |

## `PJ-020` Showing another translation of the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Current Resource with `ep01.en.srt` and `ep01.ja.srt` |
| When | its `ja` translation is shown |
| Then | its Segments carry the translations of `ep01.ja.srt` |

## `PJ-021` Selecting another Resource

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource is `ep01` |
| When | `ep02` is selected |
| Then | the Project holds the Segments of `ep02` |

## `PJ-007` Opening an SRT file opens its directory

| Step | Statement |
| --- | --- |
| Given | a directory holding `interview.srt` and `talk.srt` |
| When | `talk.srt` is opened |
| Then | the Project is that directory and its Current Resource is `talk` |

## `PJ-023` Opening a translation SRT file shows that translation

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.srt`, `ep01.en.srt` and `ep01.ja.srt` |
| When | `ep01.ja.srt` is opened |
| Then | the Current Resource is `ep01`, showing its `ja` translation |

## `PJ-008` Saying why an SRT file could not be opened

| Step | Statement |
| --- | --- |
| Given | the toolbar |
| When | an SRT file whose second cue is malformed is chosen to open |
| Then | a message says the file could not be read at its second cue |

## `PJ-003` Editing a Segment of the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Current Resource of one translated Segment |
| When | its text and its translation are edited |
| Then | the Project holds both edits |

## `PJ-004` Exporting the Current Resource as it stands

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose Segment was edited |
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

## `PJ-022` Leaving another Resource untouched by a late transcription

| Step | Statement |
| --- | --- |
| Given | a transcription of `ep01` during which `ep02` was selected |
| When | the transcription finishes |
| Then | the Project holds the Segments of `ep02` unchanged |

## `PJ-009` Moving on to translating an opened SRT file

| Step | Statement |
| --- | --- |
| Given | the toolbar |
| When | an SRT file is opened as the Project |
| Then | the Translate tab is shown |

## `PJ-010` Recording the Language of a translation

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` |
| When | its Current Resource is translated into `en` |
| Then | the Project records `en` as its translation Language and keeps `zh-TW` |

## `PJ-011` Starting a new Project without a Translation Glossary

| Step | Statement |
| --- | --- |
| Given | a Project with a Translation Glossary |
| When | another directory is opened as the Project |
| Then | the new Project holds no Translation Glossary |

## `PJ-012` Naming an export by the Resource and its Languages

| Step | Statement |
| --- | --- |
| Given | a Resource `ep01` in `/talks`, in `zh-TW` and translated into `en` |
| When | the default path of each export is asked for |
| Then | the original is `/talks/ep01.srt`, the translation `/talks/ep01.en.srt` and the bilingual `/talks/ep01.zh-TW.en.srt` |

## `PJ-014` Offering the default path when exporting

| Step | Statement |
| --- | --- |
| Given | a Project whose translation export defaults to `/talks/lecture.en.srt` |
| When | the translation is exported from the toolbar |
| Then | the save dialog opens at `/talks/lecture.en.srt` |
