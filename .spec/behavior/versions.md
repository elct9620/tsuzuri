# Versions

Listing the Backups of each subtitle of the Current Resource, comparing two Versions cue by cue, and restoring a Backup over the subtitle, so a transcription or translation that went wrong can be undone.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/project/*.rs`
- `src/controllers/versions_controller.test.ts`

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
| Then | the rows are 0 to 1 changed from `你好` to `您好`, 1 to 2 only in the Backup, and 2 to 3 only now |

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
