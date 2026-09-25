# Versions

Listing the Backups of each subtitle of the Current Resource, comparing two Versions cue by cue, and restoring a Backup over the subtitle, so a transcription or translation that went wrong can be undone.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/project/*.rs`
- `src/controllers/versions_controller.test.ts`
- `src/controllers/comparison_controller.test.ts`

## `VR-001` Listing a subtitle's Backups newest first

| Step | Statement |
| --- | --- |
| Given | Backups of `ep01.en.srt` taken at 02:30 and at 03:00 |
| When | the Versions of the Current Resource `ep01` are read |
| Then | its `en` translation lists the 03:00 Backup before the 02:30 one |

## `VR-002` Keeping each subtitle's Backups apart

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` and a Backup of `ep01.en.srt` |
| When | the Versions of the Current Resource `ep01` are read |
| Then | its original lists only the Backup of `ep01.srt` |

## `VR-003` Comparing two Versions cue by cue

| Step | Statement |
| --- | --- |
| Given | a Backup reading `你好` from 0 to 1 and `世界` from 1 to 2 seconds, and a subtitle now reading `您好` from 0 to 1 and `再見` from 2 to 3 seconds |
| When | the Backup is compared with the subtitle now |
| Then | the rows are a Pair from `你好` to `您好` with its text changed, a Removal of `世界`, and an Addition of `再見` |

## `VR-011` Pairing a retimed cue by its overlap

| Step | Statement |
| --- | --- |
| Given | a Backup reading `你好` from 0 to 1 second, and the subtitle now reading `你好` from 0 to 1.2 seconds |
| When | the two are compared |
| Then | the one row is a Pair with its times changed and its text not |

## `VR-012` Keeping apart cues that only touch

| Step | Statement |
| --- | --- |
| Given | a Backup reading `一` from 0 to 1 and `二` from 1 to 2 seconds, and the subtitle now `一` from 0 to 1.05 and `二` from 1.05 to 2 seconds |
| When | the two are compared |
| Then | the rows are two Pairs, each with its times changed |

## `VR-013` Lining up a split cue with its parts

| Step | Statement |
| --- | --- |
| Given | a Backup reading `你好世界` from 0 to 2 seconds, and the subtitle now `你好` from 0 to 1 and `世界` from 1 to 2 seconds |
| When | the two are compared |
| Then | the one row is a Split of the one cue into the two, with neither its text nor its times changed |

## `VR-014` Lining up merged cues with their whole

| Step | Statement |
| --- | --- |
| Given | a Backup reading `你好` from 0 to 1 and `世界` from 1 to 2 seconds, and the subtitle now `你好世界` from 0 to 2 seconds |
| When | the two are compared |
| Then | the one row is a Merge of the two cues into the one |

## `VR-015` Pairing a cue moved in time by its text

| Step | Statement |
| --- | --- |
| Given | a Backup reading `你好` from 0 to 1 second, and the subtitle now `你好` from 5 to 6 seconds |
| When | the two are compared |
| Then | the one row is a Pair with its times changed |

## `VR-010` Telling an Output from an Overwrite

| Step | Statement |
| --- | --- |
| Given | an Output of `ep01.srt` taken at 02:30 and an Overwrite of it taken at 03:00 |
| When | the Versions of the Current Resource `ep01` are read |
| Then | its original lists the 03:00 Backup as an Overwrite and the 02:30 one as an Output |

## `VR-004` Restoring a Backup

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `新的` and a Backup of it reading `舊的` |
| When | the Backup is restored |
| Then | `ep01.srt` and the editor read `舊的` |

## `VR-005` Keeping the subtitle a restore replaces

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `新的` and a Backup of it reading `舊的` |
| When | the Backup is restored |
| Then | a new Overwrite of `ep01.srt` reads `新的` |

## `VR-006` Refusing a Backup the subtitle does not have

A restore names its Backup by file name, so only a name the subtitle's own list holds is taken.

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` |
| When | `../ep01.srt` is restored as a Backup of its original |
| Then | the restore is refused as `no-backup` and `ep01.srt` is left as it was |

## `VR-007` Listing the Versions of the Current Resource

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose original has a Backup taken at `20260925T023000Z` |
| When | Versions is opened from the editor |
| Then | the dialog lists that Backup by its local time |

## `VR-008` Showing a comparison with what changed marked

| Step | Statement |
| --- | --- |
| Given | the Versions dialog listing a Backup |
| When | comparing it is chosen |
| Then | the dialog shows each row beside the one now, marking the rows that differ |

## `VR-009` Restoring a Backup from the dialog

| Step | Statement |
| --- | --- |
| Given | the Versions dialog listing a Backup of the `en` translation |
| When | restoring it is chosen |
| Then | the Project is asked to restore that Backup of `en`, and a Notification says it was restored |

## `VR-016` Taking back the text of one cue

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` reading `你好` from 0 to 1 second, and `ep01.srt` now `您好` from 0 to 1.2 seconds |
| When | the text of that row is taken back |
| Then | `ep01.srt` reads `你好` from 0 to 1.2 seconds |

## `VR-017` Taking back the times of one cue

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` reading `你好` from 0 to 1 second, and `ep01.srt` now `您好` from 0 to 1.2 seconds |
| When | the times of that row are taken back |
| Then | `ep01.srt` reads `您好` from 0 to 1 second |

## `VR-018` Taking back a removed cue

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` reading `你好` from 0 to 1 and `世界` from 1 to 2 seconds, and `ep01.srt` now only `你好` |
| When | the row of `世界` is taken back |
| Then | `ep01.srt` reads `你好` and then `世界` from 1 to 2 seconds |

## `VR-019` Taking back an added cue

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` reading `你好`, and `ep01.srt` now `你好` and `再見` from 2 to 3 seconds |
| When | the row of `再見` is taken back |
| Then | `ep01.srt` reads only `你好` |

## `VR-020` Taking back a split

| Step | Statement |
| --- | --- |
| Given | a Backup of `ep01.srt` reading `你好世界` from 0 to 2 seconds, and `ep01.srt` now `你好` from 0 to 1 and `世界` from 1 to 2 seconds |
| When | the row is taken back |
| Then | `ep01.srt` reads `你好世界` from 0 to 2 seconds |

## `VR-021` Undoing a cue taken back

| Step | Statement |
| --- | --- |
| Given | the text of one row of `ep01.srt` taken back |
| When | the change is undone |
| Then | `ep01.srt` reads as it did before |

## `VR-022` Refusing a row the comparison does not have

| Step | Statement |
| --- | --- |
| Given | a comparison of a Backup with `ep01.srt` of one row |
| When | its second row is taken back |
| Then | it is refused as `no-row` and `ep01.srt` is left as it was |

## `VR-023` Comparing the editor with the newest Output

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose original has an Output taken at 02:30 and an Overwrite at 03:00 |
| When | the editor shows it |
| Then | its comparison is of the 02:30 Output with the original now |

## `VR-024` Marking what changed on each row

| Step | Statement |
| --- | --- |
| Given | a comparison whose rows are a Pair with its text changed, a Pair with its times changed, and an Addition |
| When | the editor shows the Segments |
| Then | the rows are marked as changed in text, changed in times, and added |

## `VR-025` Showing what a changed text read before

| Step | Statement |
| --- | --- |
| Given | a comparison whose Pair reads `你好` in the Backup and `您好` now |
| When | the editor shows the Segments |
| Then | the row shows `你好` beneath its text |

## `VR-026` Showing a removed cue in its place

| Step | Statement |
| --- | --- |
| Given | a comparison with a Removal of `世界` from 1 to 2 seconds, between two Segments |
| When | the editor shows the Segments |
| Then | a row saying `世界` was removed stands between them |

## `VR-027` Taking back a row from the editor

| Step | Statement |
| --- | --- |
| Given | the editor comparing a Backup, with a Pair whose text changed |
| When | taking back only its text is chosen |
| Then | the Project is asked to take back the text of that row of that Backup, and a Notification says it was taken back |

## `VR-028` Comparing with nothing

| Step | Statement |
| --- | --- |
| Given | the editor comparing a Backup |
| When | no Backup is chosen to compare |
| Then | no row is marked |

## `VR-029` Moving the comparison to a newer Output

| Step | Statement |
| --- | --- |
| Given | the editor comparing the original's Output taken at 02:30 |
| When | a transcription keeps a newer Output of the original |
| Then | its comparison is of the newer Output |

## `VR-030` Offering the Backups of the translation shown

| Step | Statement |
| --- | --- |
| Given | the editor showing only the original of a Current Resource whose `en` translation has an Output |
| When | the `en` translation is shown |
| Then | that Output is offered to compare |

## `VR-031` Marking the characters that changed within a cue

| Step | Statement |
| --- | --- |
| Given | a Backup reading `資料不上傳` from 0 to 1 second, and the subtitle now `資料不會上傳` |
| When | the two are compared |
| Then | the Pair's text is `資料不` kept, `會` added, and `上傳` kept |

## `VR-032` Saying which kind each Backup is

| Step | Statement |
| --- | --- |
| Given | the Versions dialog of a subtitle with an Output and an Overwrite |
| When | its Backups are listed |
| Then | each is labelled as an Output or as kept before an overwrite |

## `VR-033` Showing only the rows that differ

| Step | Statement |
| --- | --- |
| Given | a comparison in the Versions dialog of one row that differs and one that does not |
| When | only the differences are asked for |
| Then | only the row that differs is shown |

## `VR-034` Moving to the next difference

| Step | Statement |
| --- | --- |
| Given | a comparison in the Versions dialog whose second row is the first to differ |
| When | the next difference is asked for |
| Then | the second row is the one marked current |

## `VR-035` Taking back a row from the Versions dialog

| Step | Statement |
| --- | --- |
| Given | a Backup compared with the subtitle now in the Versions dialog |
| When | a row that differs is taken back |
| Then | the Project is asked to take back that whole row of that Backup, and a Notification says it was taken back |

## `VR-036` Showing the characters that changed

| Step | Statement |
| --- | --- |
| Given | a comparison whose Pair adds `會` to `資料不上傳` |
| When | the Versions dialog shows it |
| Then | `會` is marked as added on the side of the subtitle now |

## `VR-037` Reading a translation's cues as written

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` whose `ep01.ja.srt` reads `こんにちは` from 0 to 1 second |
| When | the cues of its `ja` translation are read |
| Then | they are `こんにちは` from 0 to 1 second |

## `VR-038` Offering the other translations to read beside the cues

| Step | Statement |
| --- | --- |
| Given | the editor showing the `en` translation of a Current Resource translated into `en` and `ja` |
| When | the compare menu is offered |
| Then | it offers `ja` to read beside the cues, which can be chosen with others, and not `en` |

## `VR-039` Showing a translation beside each cue

| Step | Statement |
| --- | --- |
| Given | the editor reading `ja` beside the cues, whose cue from 0 to 1 second reads `こんにちは` |
| When | the Segments are shown |
| Then | the Segment from 0 to 1 second shows `こんにちは` beneath its texts, named `ja` |

## `VR-040` Comparing the original and the translation at once

| Step | Statement |
| --- | --- |
| Given | the editor showing the `en` translation, comparing the original with its Output and `en` with its Output |
| When | the Segments are shown |
| Then | the marks of each comparison stand beside the text field they compare, the original's by the text and `en`'s by the translation |

## `VR-041` Reading several translations beside the cues

| Step | Statement |
| --- | --- |
| Given | the editor reading `ja` and `ko` beside the cues |
| When | the Segments are shown |
| Then | each Segment shows its `ja` and its `ko` cue beneath its text, each named by its Language |

## `VR-042` Keeping the compare menu short

However many Backups a subtitle has, the menu offers a few; the Versions dialog lists them all.

| Step | Statement |
| --- | --- |
| Given | an original with an Output and three Overwrites |
| When | the compare menu is offered |
| Then | it offers the Output, nothing, and a way to choose another in the Versions dialog |

## `VR-043` Comparing with a Backup chosen in the Versions dialog

| Step | Statement |
| --- | --- |
| Given | the Versions dialog listing an Overwrite of the original |
| When | it is set as the comparison |
| Then | the editor compares the original with that Overwrite, and the menu offers it |

## `VR-044` Comparing the translation with nothing once another is shown

A Backup of one translation says nothing about another, so its comparison ends with the translation shown.

| Step | Statement |
| --- | --- |
| Given | the editor comparing the `en` translation with its Output |
| When | the `ja` translation is shown instead |
| Then | the translation is compared with nothing |

## `VR-045` Marking the characters added within a text field

| Step | Statement |
| --- | --- |
| Given | a comparison whose Pair reads `資料不上傳` in the Backup and `資料不會上傳` now |
| When | the Segments are shown |
| Then | `會` is marked as added inside the text field, and `資料不上傳` shows beneath it as before |

## `VR-046` Saying whose cue was removed

| Step | Statement |
| --- | --- |
| Given | the editor comparing the `en` translation, whose Backup has a cue the translation no longer has |
| When | the Segments are shown |
| Then | the removed row says it was removed from `en` |

## `VR-047` Counting the Segments a restore leaves without a translation

A translation lines up with its original by time alone, so a restore that splits a merged Segment again leaves its parts with none; saying so points at translating them again.

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `你好世界` from 0 to 2 seconds, translated in `ep01.en.srt`, and a Backup of `ep01.srt` reading `你好` from 0 to 1 and `世界` from 1 to 2 seconds |
| When | the Backup is restored, or its row is taken back |
| Then | the answer counts 2 Segments without a translation |

## `VR-048` Pointing at the Segments a restore leaves without a translation

| Step | Statement |
| --- | --- |
| Given | the editor comparing a Backup of the original |
| When | a row taken back leaves 2 Segments without a translation |
| Then | beside the Notification that it was taken back, a warning says 2 Segments no longer line up with a translation and can be translated again |
