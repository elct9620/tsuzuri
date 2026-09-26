# Project

The directory Rust holds open as the single source of truth: which files make its Resources, which Resource is current, what changes it, and what refuses to run without it.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/project/*.rs`
- `src-tauri/src/transcription.rs`
- `src-tauri/src/transcription/*.rs`
- `src-tauri/src/translation.rs`
- `src/controllers/project_controller.test.ts`
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

## `PJ-104` Pairing subtitles with a media file whose name ends like a Language code

A media file's name is a Resource's name as it stands, so the subtitles Tsuzuri writes for it are found again.

| Step | Statement |
| --- | --- |
| Given | a directory holding `talk.hd.mp4`, `talk.hd.srt` and `talk.hd.en.srt` |
| When | it is opened in `zh-TW` |
| Then | the Project lists only `talk.hd`, holding `talk.hd.srt` as its original and `talk.hd.en.srt` as its `en` translation |

## `PJ-105` Naming a Resource by a subtitle whose name ends like an unknown Language code

| Step | Statement |
| --- | --- |
| Given | a directory holding `talk.hd.srt` and `talk.hd.en.srt` |
| When | it is opened in `zh-TW` |
| Then | the Project lists only `talk.hd`, holding `talk.hd.srt` as its original and `talk.hd.en.srt` as its `en` translation |

## `PJ-106` Pairing a subtitle with the Resource its whole name before the code names

| Step | Statement |
| --- | --- |
| Given | a directory holding `lecture.mp4`, `lecture.ja.mp4` and `lecture.ja.en.srt` |
| When | it is opened in `zh-TW` |
| Then | `lecture.ja` has the `en` translation and `lecture` has none |

## `PJ-107` Showing a translation again after showing none

| Step | Statement |
| --- | --- |
| Given | a Current Resource `talk.hd` of `talk.hd.mp4` and `talk.hd.srt` just translated into `en`, with no translation shown since |
| When | `en` is shown |
| Then | the Segments carry the `en` translation |

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

## `PJ-024` Reading the Primary Language from the Project Config

| Step | Statement |
| --- | --- |
| Given | a directory whose `tsuzuri.config.json` records `ja` |
| When | it is opened in `zh-TW` |
| Then | the Project is in `ja` |

## `PJ-025` Recording a new Primary Language in the Project Config

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` without a Project Config |
| When | its Primary Language is changed to `ja` |
| Then | `tsuzuri.config.json` records `ja` |

## `PJ-026` Pairing subtitles again under a new Primary Language

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` holding `ep01.ja.srt` and no `ep01.srt` |
| When | its Primary Language is changed to `ja` |
| Then | `ep01` holds the Segments of `ep01.ja.srt` as its original |

## `PJ-027` Recording the translation Language in the Project Config

| Step | Statement |
| --- | --- |
| Given | a Project without a Project Config |
| When | its Current Resource is translated into `en` |
| Then | `tsuzuri.config.json` records `en` as the translation Language |

## `PJ-028` Writing an edited original back to its file

| Step | Statement |
| --- | --- |
| Given | a Current Resource read from `ep01.srt` |
| When | the text of a Segment is edited |
| Then | `ep01.srt` carries the edited text |

## `PJ-029` Writing an edited translation back to its file

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its translation from `ep01.en.srt` |
| When | the translation of a Segment is edited |
| Then | `ep01.en.srt` carries the edited translation |

## `PJ-030` Leaving untranslated Segments out of a translation file

| Step | Statement |
| --- | --- |
| Given | a Current Resource of two Segments showing `en`, only the first translated |
| When | the translation of the first is edited |
| Then | `ep01.en.srt` holds one cue |

## `PJ-031` Writing the translation beside its original

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource `ep01` is two Segments |
| When | its translation into `en` is written |
| Then | `ep01.en.srt` holds both translations |

## `PJ-032` Writing the translation of a Resource no longer current

| Step | Statement |
| --- | --- |
| Given | a translation of `ep01` during which `ep02` was selected |
| When | its translation into `en` is written |
| Then | `ep01.en.srt` holds the translations and `ep02` shows none of them |

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
| When | a directory without `glossary.csv` is opened as the Project |
| Then | the new Project holds no Translation Glossary |

## `PJ-012` Naming an export by the Resource and its Languages

| Step | Statement |
| --- | --- |
| Given | a Resource `ep01` in `/talks`, in `zh-TW` and translated into `en` |
| When | the default path of each export is asked for |
| Then | the original is `/talks/ep01.srt`, the translation `/talks/ep01.en.srt` and the bilingual `/talks/ep01.zh-TW.en.srt` |

## `PJ-044` Putting the translation first in a Bilingual SRT

| Step | Statement |
| --- | --- |
| Given | a Project whose Bilingual Order puts the translation first, with a Current Resource translated into `en` |
| When | it is exported as a Bilingual SRT |
| Then | each translated cue carries the translation above the original |

## `PJ-045` Naming a Bilingual SRT in its Bilingual Order

| Step | Statement |
| --- | --- |
| Given | a Resource `ep01` in `/talks`, in `zh-TW` and translated into `en`, whose Bilingual Order puts the translation first |
| When | the default path of its bilingual export is asked for |
| Then | it is `/talks/ep01.en.zh-TW.srt` |

## `PJ-046` Keeping the Project Options in the Project Config

| Step | Statement |
| --- | --- |
| Given | a Project whose Bilingual Order was set to put the translation first |
| When | its directory is opened again |
| Then | its Bilingual Order puts the translation first |

## `PJ-047` Choosing the Bilingual Order in the settings

| Step | Statement |
| --- | --- |
| Given | the settings of a Project whose Bilingual Order puts the original first |
| When | the translation is chosen to go first |
| Then | the Project Options are set with the translation first |

## `PJ-014` Offering the default path when exporting

| Step | Statement |
| --- | --- |
| Given | a Project whose translation export defaults to `/talks/lecture.en.srt` |
| When | the translation is exported from the toolbar |
| Then | the save dialog opens at `/talks/lecture.en.srt` |

## `PJ-033` Opening a directory from the toolbar

| Step | Statement |
| --- | --- |
| Given | an interface in Traditional Chinese |
| When | a directory is chosen to open |
| Then | it is opened as the Project in `zh-TW` |

## `PJ-034` Listing the Resources

| Step | Statement |
| --- | --- |
| Given | a Project of `ep01` translated into `en` and `ep02` of a media file alone |
| When | the Resource list shows it |
| Then | it lists `ep01` with `en` and `ep02` marked as having no subtitle |

## `PJ-038` Naming a Resource in full when its name is cut short

| Step | Statement |
| --- | --- |
| Given | a Project of a Resource named `[SHANA]C0220260514.zh-TW.mix` |
| When | the Resource list shows it |
| Then | its item's tooltip reads `[SHANA]C0220260514.zh-TW.mix` |

## `PJ-035` Selecting a Resource from the list

| Step | Statement |
| --- | --- |
| Given | the Resource list of `ep01` and `ep02` |
| When | `ep02` is clicked |
| Then | `ep02` is selected as the Current Resource |

## `PJ-036` Starting without a Project

| Step | Statement |
| --- | --- |
| Given | no Project |
| When | the window shows |
| Then | only the start screen is shown |

## `PJ-037` Changing the Primary Language in the settings

| Step | Statement |
| --- | --- |
| Given | the settings of a Project in `zh-TW` |
| When | `ja` is chosen as its Primary Language |
| Then | the Project's Primary Language is set to `ja` |

## `PJ-050` Saving the Bilingual SRT of an edited translation

With the option on, each translation keeps a Bilingual SRT beside it, written in the Bilingual Order whenever either of its texts is written.

| Step | Statement |
| --- | --- |
| Given | a Project saving Bilingual SRTs, in `zh-TW`, whose `ep01` is translated into `en` |
| When | a Segment's translation is edited |
| Then | `ep01.zh-TW.en.srt` carries the edited translation below its original |

## `PJ-051` Saving every Bilingual SRT when the original is edited

| Step | Statement |
| --- | --- |
| Given | a Project saving Bilingual SRTs, in `zh-TW`, whose `ep01` is translated into `en` and `ja` |
| When | a Segment's text is edited |
| Then | `ep01.zh-TW.en.srt` and `ep01.zh-TW.ja.srt` both carry the edited text |

## `PJ-052` Saving the Bilingual SRT once translated

| Step | Statement |
| --- | --- |
| Given | a Project saving Bilingual SRTs, in `zh-TW`, with a Resource `ep01` |
| When | its translation into `en` is written |
| Then | `ep01.zh-TW.en.srt` carries each original above its translation |

## `PJ-053` Saving the Bilingual SRTs once transcribed

| Step | Statement |
| --- | --- |
| Given | a Project saving Bilingual SRTs, in `zh-TW`, whose `lecture` has an `en` translation |
| When | its media file is transcribed |
| Then | `lecture.zh-TW.en.srt` carries the text just transcribed |

## `PJ-054` Saving no Bilingual SRT unless asked

| Step | Statement |
| --- | --- |
| Given | a Project not saving Bilingual SRTs, whose `ep01` is translated into `en` |
| When | a Segment's text is edited |
| Then | the directory holds no `ep01.zh-TW.en.srt` |

## `PJ-055` Choosing to save Bilingual SRTs in the settings

| Step | Statement |
| --- | --- |
| Given | the settings of a Project not saving Bilingual SRTs |
| When | saving them is turned on |
| Then | the Project Options are set to save Bilingual SRTs |

## `PJ-056` Writing an edited Speaker back to the subtitle

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01.srt` reads `你好` |
| When | the Speaker of its Segment is set to `co` |
| Then | `ep01.srt` reads `co: 你好` |

## `PJ-057` Changing a Segment's times in every subtitle

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01` has a Segment from 0 to 1 second in `ep01.srt` and `ep01.en.srt` |
| When | its times are changed to 0.5 to 1.5 seconds |
| Then | the Segment runs from 0.5 to 1.5 seconds in both files |

## `PJ-058` Inserting a Segment into the gap after another

| Step | Statement |
| --- | --- |
| Given | a Current Resource of Segments from 0 to 1 and from 3 to 4 seconds |
| When | a Segment is inserted after the first |
| Then | an empty Segment from 1 to 3 seconds stands between them |

## `PJ-059` Inserting a Segment before the first

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose first Segment runs from 5 to 6 seconds |
| When | a Segment is inserted before it |
| Then | an empty Segment from 3 to 5 seconds comes first |

## `PJ-060` Deleting a Segment from every subtitle

| Step | Statement |
| --- | --- |
| Given | a Current Resource of two Segments translated into `en` |
| When | the first is deleted |
| Then | the original and the translation each hold only the second |

## `PJ-061` Splitting a Segment at a point in its text

| Step | Statement |
| --- | --- |
| Given | a Current Resource of one Segment `你好世界` from 0 to 2 seconds, translated as `Hello world` |
| When | it is split after `你好` |
| Then | `你好` runs from 0 to 1 second with the translation and `世界` from 1 to 2 seconds without one |

## `PJ-062` Merging a run of Segments

| Step | Statement |
| --- | --- |
| Given | a Current Resource of `你好` from 0 to 1 and `世界` from 1 to 2 seconds, translated as `Hello` and `world` |
| When | the two are merged |
| Then | one Segment from 0 to 2 seconds reads `你好` above `世界`, translated as `Hello` above `world` |

## `PJ-063` Shifting a run of Segments

| Step | Statement |
| --- | --- |
| Given | a Current Resource of Segments from 0 to 1, 1 to 2 and 2 to 3 seconds |
| When | the last two are shifted by half a second |
| Then | they run from 1.5 to 2.5 and 2.5 to 3.5 seconds, and the first is unchanged |

## `PJ-064` Stopping a shift at the start of the media

| Step | Statement |
| --- | --- |
| Given | a Current Resource of one Segment from 1 to 3 seconds |
| When | it is shifted back by two seconds |
| Then | it runs from 0 to 1 second |

## `PJ-065` Refusing a Segment that ends before it starts

| Step | Statement |
| --- | --- |
| Given | a Current Resource of one Segment from 0 to 1 second |
| When | its times are changed to 2 to 1 seconds |
| Then | the change is refused as `invalid-times` and the subtitle is left as it was |

## `PJ-101` Moving the edge two Segments share in every subtitle

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01` has Segments from 0 to 1 and from 1 to 2 seconds in `ep01.srt` and `ep01.en.srt` |
| When | the edge after the first is moved to 1.5 seconds |
| Then | the first runs from 0 to 1.5 and the second from 1.5 to 2 seconds in both files |

## `PJ-102` Refusing to move a shared edge past either Segment

| Step | Statement |
| --- | --- |
| Given | a Current Resource of Segments from 0 to 1 and from 1 to 2 seconds |
| When | the edge after the first is moved to 2.5 seconds |
| Then | the change is refused as `invalid-times` and the subtitle is left as it was |

## `PJ-103` Inserting a Segment at times of its own

| Step | Statement |
| --- | --- |
| Given | a Current Resource of Segments from 0 to 1 and from 3 to 4 seconds |
| When | a Segment is inserted from 1.5 to 2.5 seconds |
| Then | an empty Segment from 1.5 to 2.5 seconds stands between them |

## `PJ-066` Backing up the original before a transcription overwrites it

| Step | Statement |
| --- | --- |
| Given | a Project keeping Backups, whose `lecture.srt` reads `舊的` |
| When | `lecture` is transcribed again |
| Then | `.tsuzuri/history/` holds an Overwrite of `lecture.srt` reading `舊的` |

## `PJ-067` Backing up a translation before it is written again

| Step | Statement |
| --- | --- |
| Given | a Project keeping Backups, whose `ep01.en.srt` reads `Hello` |
| When | its translation into `en` is written again |
| Then | `.tsuzuri/history/` holds an Overwrite of `ep01.en.srt` reading `Hello` |

## `PJ-068` Keeping no Overwrite unless asked

| Step | Statement |
| --- | --- |
| Given | a Project not keeping Backups, whose `ep01.en.srt` exists |
| When | its translation into `en` is written again |
| Then | `.tsuzuri/history/` holds only the Output of `ep01.en.srt` |

## `PJ-088` Keeping what a transcription wrote as an Output

| Step | Statement |
| --- | --- |
| Given | a Project not keeping Backups, whose `lecture` has only a media file |
| When | `lecture` is transcribed as `你好` |
| Then | `.tsuzuri/history/` holds an Output of `lecture.srt` reading `你好` |

## `PJ-089` Keeping what a translation wrote as an Output

| Step | Statement |
| --- | --- |
| Given | a Project not keeping Backups, whose `ep01.srt` has no translation |
| When | its translation into `en` is written as `Hello` |
| Then | `.tsuzuri/history/` holds an Output of `ep01.en.srt` reading `Hello` |

## `PJ-108` Listing a translation whose Output could not be kept

| Step | Statement |
| --- | --- |
| Given | a Project whose `ep01.srt` has no translation, and where `.tsuzuri` is a file, so no Backup can be kept |
| When | its translation into `en` is written |
| Then | the writing fails, and `ep01` lists the `en` translation it wrote |

## `PJ-069` Leaving Backups out of the Resources

| Step | Statement |
| --- | --- |
| Given | a directory holding `ep01.srt`, `.tsuzuri/history/ep01.20260925T023000Z.srt` and `.tsuzuri/history/ep01.20260925T023001Z.output.srt` |
| When | it is opened |
| Then | the Project lists only `ep01` |

## `PJ-070` Choosing to keep Backups in the settings

| Step | Statement |
| --- | --- |
| Given | the settings of a Project not keeping Backups |
| When | keeping them is turned on |
| Then | the Project Options are set to keep Backups |

## `PJ-048` Offering only the general settings without a Project

| Step | Statement |
| --- | --- |
| Given | no Project |
| When | the settings show |
| Then | only the general settings are offered |

## `PJ-049` Opening the settings at the Project's own once one is open

| Step | Statement |
| --- | --- |
| Given | the settings showing only the general settings, with no Project |
| When | a Project is opened |
| Then | the settings show the Project's own |

## `PJ-039` Keeping an edit off a subtitle changed elsewhere

A subtitle is often corrected in a dedicated subtitle editor, and writing an edit back would overwrite that correction.

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose `ep01.srt` another program rewrote after Tsuzuri read it |
| When | a Segment's text is edited |
| Then | `ep01.srt` keeps what the other program wrote |

## `PJ-040` Reading again a subtitle an edit found changed elsewhere

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose `ep01.srt` another program rewrote after Tsuzuri read it |
| When | a Segment's text is edited |
| Then | the Current Resource holds what the other program wrote |

## `PJ-041` Reading again a subtitle changed elsewhere when the window regains focus

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose `ep01.srt` another program rewrote after Tsuzuri read it |
| When | the window regains focus |
| Then | the Current Resource holds what the other program wrote |

## `PJ-109` Listing files added elsewhere when the Project is reloaded

| Step | Statement |
| --- | --- |
| Given | a Project of `ep01.srt` whose directory gained `ep01.en.srt` and `ep02.srt` after it was opened |
| When | the Project is reloaded |
| Then | the Project lists `ep01` with the `en` translation, and `ep02` |

## `PJ-110` Keeping the Undo History of a Current Resource no one else changed

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose first Segment's text was just edited |
| When | the Project is reloaded |
| Then | the edit can still be undone |

## `PJ-111` Showing the same translation after a reload

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` showing no translation, though `ep01.en.srt` is there |
| When | the Project is reloaded |
| Then | the Current Resource shows no translation |

## `PJ-112` Selecting the first Resource once the Current Resource is gone

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep02` whose `ep02.srt` was removed elsewhere, beside `ep01.srt` |
| When | the Project is reloaded |
| Then | the Current Resource is `ep01` |

## `PJ-113` Reloading only the Resource list while a Mode runs on the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being translated, whose directory gained `ep02.srt` |
| When | the Project is reloaded |
| Then | the Project lists `ep02`, and `ep01` keeps the Segments the translation shows |

## `PJ-114` Listing files added elsewhere when the window regains focus

| Step | Statement |
| --- | --- |
| Given | a Project of `ep01.srt` whose directory gained `ep02.srt` after it was opened |
| When | the window regains focus |
| Then | the Project lists `ep01` and `ep02` |

## `PJ-115` Reloading the Project from the Resource list

| Step | Statement |
| --- | --- |
| Given | an open Project |
| When | the reload button above the Resource list is clicked, or ⌘R or Ctrl+R is pressed |
| Then | the Project is reloaded |

## `PJ-042` Writing edit after edit

What Tsuzuri wrote itself is never taken for a change made elsewhere.

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose first Segment's text was just edited |
| When | its second Segment's text is edited |
| Then | `ep01.srt` holds both edits |

## `PJ-043` Editing a translation Tsuzuri just wrote

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose translation into `en` Tsuzuri just wrote to `ep01.en.srt` |
| When | a Segment's translation is edited |
| Then | `ep01.en.srt` holds the edit |

## `PJ-071` Naming a Speaker in a translation as the Translation Glossary does

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, and whose `ep01.srt` reads `小明: 你好` with `ep01.en.srt` shown |
| When | its translation is edited to `Hi` |
| Then | `ep01.en.srt` reads `Xiao Ming: Hi` |

## `PJ-072` Keeping a Speaker's name the Translation Glossary does not give

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` without `glossary.csv` whose `ep01.srt` reads `co: 你好` with `ep01.en.srt` shown |
| When | its translation is edited to `Hi` |
| Then | `ep01.en.srt` reads `co: Hi` |

## `PJ-073` Naming a Speaker in each text of a Bilingual SRT

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, and whose `ep01.srt` reads `小明: 你好`, saving Bilingual SRTs, with `ep01.en.srt` shown |
| When | its translation is edited to `Hi` |
| Then | `ep01.zh-TW.en.srt` reads `小明: 你好` above `Xiao Ming: Hi` |

## `PJ-074` Naming a Speaker in a translation just made

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, and whose `ep01.srt` reads `小明: 你好` |
| When | a translation into `en` of `Hello` is written |
| Then | `ep01.en.srt` reads `Xiao Ming: Hello` |

## `PJ-075` Naming a Speaker in a translation saved elsewhere

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, and whose `ep01.srt` reads `小明: 你好` with `ep01.en.srt` shown reading `Hello` |
| When | its translation is saved as SRT |
| Then | the file reads `Xiao Ming: Hello` |

## `PJ-076` Naming a Speaker in a translation a Segment Change rewrites

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, and whose `ep01.srt` reads `小明: 你好` from 0 to 1 second, with `ep01.en.srt` reading `Hello` |
| When | its times are changed to 0.5 to 1.5 seconds |
| Then | `ep01.en.srt` reads `Xiao Ming: Hello` from 0.5 to 1.5 seconds |

## `PJ-077` Writing an edited Speaker to every translation

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01.srt` reads `你好`, `ep01.en.srt` `Hello` and `ep01.ja.srt` `こんにちは`, with `ep01.en.srt` shown |
| When | the Speaker of its Segment is set to `co` |
| Then | `ep01.en.srt` reads `co: Hello` and `ep01.ja.srt` reads `co: こんにちは` |

## `PJ-078` Leaving a translation's cue without a matching Segment as it is

A cue with other times belongs to no Segment, so a Speaker has nowhere to come from.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01.srt` has `你好` from 0 to 1 second, and whose `ep01.ja.srt` has `こんにちは` from 0 to 1 second and `cl: さようなら` from 2 to 3 seconds |
| When | the Speaker of its Segment is set to `co` |
| Then | `ep01.ja.srt` reads `co: こんにちは`, then `cl: さようなら` from 2 to 3 seconds |

## `PJ-079` Naming an edited Speaker in every translation as the Translation Glossary does

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, whose `ep01.srt` reads `你好`, `ep01.en.srt` `Hello` and `ep01.ja.srt` `こんにちは`, with `ep01.ja.srt` shown |
| When | the Speaker of its Segment is set to `小明` |
| Then | `ep01.en.srt` reads `Xiao Ming: Hello` |

## `PJ-080` Carrying the Speakers of a new transcription to each translation

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01` has a media file, `ep01.srt` reading `co: 你好` and `ep01.en.srt` reading `co: Hello` |
| When | a transcription of `你好` with no Speaker is written over `ep01.srt` |
| Then | `ep01.en.srt` reads `Hello` |

## `PJ-081` Keeping a Backup of a translation a transcription changes

| Step | Statement |
| --- | --- |
| Given | a Project keeping Backups whose `ep01` has a media file, `ep01.srt` reading `co: 你好` and `ep01.en.srt` reading `co: Hello` |
| When | a transcription of `你好` with no Speaker is written over `ep01.srt` |
| Then | the history holds an Overwrite of `ep01.en.srt` reading `co: Hello` |


## `PJ-082` Keeping no Backup of a translation a transcription leaves as it is

| Step | Statement |
| --- | --- |
| Given | a Project keeping Backups whose `ep01` has a media file, `ep01.srt` reading `你好` and `ep01.en.srt` reading `Hello` |
| When | a transcription of `你好` with no Speaker is written over `ep01.srt` |
| Then | the history holds no Overwrite of `ep01.en.srt` |

## `PJ-083` Keeping one label on a translation with a long Speaker name

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Christopher Nolan Jr.` in `en`, whose `ep01.srt` reads `小明: 你好` from 0 to 1 second and `ep01.en.srt` `Christopher Nolan Jr.: Hello` |
| When | its times are changed to 0.5 to 1.5 seconds |
| Then | `ep01.en.srt` reads `Christopher Nolan Jr.: Hello` from 0.5 to 1.5 seconds |

## `PJ-084` Reading a translation's dialogue that opens like a label

A translation's labels come from its original, so a line that only looks like one is dialogue.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01.srt` reads `你好` and `ep01.en.srt` `Note: hi` |
| When | `ep01.en.srt` is shown |
| Then | its Segment's translation reads `Note: hi` |

## `PJ-085` Taking off only the label a translation's Speaker has

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Xiao Ming` in `en`, whose `ep01.srt` reads `小明: 你好` and `ep01.en.srt` `Xiao Ming: Note: hi` |
| When | `ep01.en.srt` is shown |
| Then | its Segment's translation reads `Note: hi` |

## `PJ-086` Putting a new Speaker before a translation's dialogue as written

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `ep01.srt` reads `你好`, `ep01.en.srt` `Note: hi` and `ep01.ja.srt` `メモ：やあ`, with `ep01.en.srt` shown |
| When | the Speaker of its Segment is set to `co` |
| Then | `ep01.ja.srt` reads `co: メモ：やあ` |


## `PJ-087` Taking off a Speaker's former name in a translation

A name changed in the Translation Glossary since a translation was written leaves the former one on its labels.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` names the Speaker `小明` as `Ming` in `en`, whose `ep01.srt` reads `小明: 你好` and `ep01.en.srt` `Xiao Ming: Hello` |
| When | `ep01.en.srt` is shown |
| Then | its Segment's translation reads `Hello` |

## `PJ-090` Refusing an edit while its Resource is transcribed

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being transcribed, whose `ep01.srt` reads `你好` |
| When | its text is edited to `您好` |
| Then | the edit is refused as `mode-running` and `ep01.srt` reads `你好` |

## `PJ-091` Refusing an edit of the translation being written

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being translated into `en`, showing its `en` translation |
| When | a translation is edited |
| Then | the edit is refused as `mode-running` |

## `PJ-092` Editing the original while it is translated

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being translated into `en`, whose `ep01.srt` reads `你好` |
| When | its text is edited to `您好` |
| Then | `ep01.srt` reads `您好` |

## `PJ-093` Refusing a Segment Change or an undo while a Mode runs

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being translated into `en`, with an edit to undo |
| When | a Segment is deleted, and the edit undone |
| Then | both are refused as `mode-running` |

## `PJ-094` Freeing the subtitles once a Mode ends

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose transcription has ended, done or failed |
| When | its text is edited |
| Then | the edit is written to `ep01.srt` |

## `PJ-095` Saying which Mode runs on the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` being translated into `en` |
| When | the Project is read |
| Then | its Current Resource is said to be translated into `en` |

## `PJ-096` Clearing a Speaker from the original and every translation

| Step | Statement |
| --- | --- |
| Given | a Project whose `ep01.srt` reads `co: 你好` and `ep01.en.srt` `co: Hello` |
| When | the Speaker of its Segment is set to nothing |
| Then | `ep01.srt` reads `你好` and `ep01.en.srt` reads `Hello` |

## `PJ-097` Naming the Speaker of several Segments at once

| Step | Statement |
| --- | --- |
| Given | a Project whose `ep01.srt` reads `你好`, `嗨` and `再見`, translated in `ep01.en.srt` |
| When | the Speaker of its first and third Segments is set to `co` at once |
| Then | `ep01.srt` and `ep01.en.srt` label only their first and third cues `co` |

## `PJ-098` Undoing Speakers named at once in one step

| Step | Statement |
| --- | --- |
| Given | a Project whose three Segments were all given the Speaker `co` at once |
| When | the change is undone |
| Then | no Segment names a Speaker |

## `PJ-099` Writing a translation made again as one change

| Step | Statement |
| --- | --- |
| Given | three Segments translated into `en` as `A`, `B` and `C`, shown in the editor |
| When | the second is translated again as `B2` |
| Then | `ep01.en.srt` reads `A`, `B2` and `C`, no Backup is kept, and one undo puts `B` back |

## `PJ-100` Refusing to translate again with no translation shown

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing no translation |
| When | a Segment is asked to be translated again |
| Then | it is refused as `no-translation-shown` before any Model is loaded |

## `PJ-104` Keeping the Project Models and Transcription Settings in the Project Config

| Step | Statement |
| --- | --- |
| Given | a Project with a transcription Project Model that sets VAD on for itself |
| When | its directory is opened again |
| Then | it has that Project Model and VAD on, and follows the general settings in the rest |
