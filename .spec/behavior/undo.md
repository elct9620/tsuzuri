# Undo

Taking back the changes Tsuzuri made to the Current Resource's subtitles, and making them again, one change at a time, so a mistake or a run gone wrong costs a keystroke rather than a restore.

## Includes

- `src-tauri/src/project.rs`
- `src-tauri/src/project/*.rs`
- `src/controllers/undo_controller.test.ts`

## `UD-001` Undoing an edit

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `你好`, edited to `您好` |
| When | the change is undone |
| Then | `ep01.srt` and the editor read `你好` |

## `UD-002` Redoing an undone edit

| Step | Statement |
| --- | --- |
| Given | an edit of `ep01.srt` from `你好` to `您好`, undone |
| When | the change is redone |
| Then | `ep01.srt` reads `您好` |

## `UD-003` Undoing a Segment Change across every subtitle

| Step | Statement |
| --- | --- |
| Given | a Current Resource of two Segments in `ep01.srt` and `ep01.en.srt`, merged into one |
| When | the change is undone |
| Then | `ep01.srt` and `ep01.en.srt` each hold two cues again |

## `UD-004` Undoing a translation as one change

| Step | Statement |
| --- | --- |
| Given | a Current Resource `ep01` with no translation, translated into `en` |
| When | the change is undone |
| Then | `ep01.en.srt` no longer exists |

## `UD-005` Undoing a transcription as one change

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `舊的`, transcribed again as `新的` |
| When | the change is undone |
| Then | `ep01.srt` reads `舊的` |

## `UD-006` Undoing a restore

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `新的`, a Backup of it reading `舊的` restored |
| When | the change is undone |
| Then | `ep01.srt` reads `新的` |

## `UD-007` Clearing what can be redone with a new change

| Step | Statement |
| --- | --- |
| Given | an edit of `ep01.srt`, undone |
| When | another edit is made |
| Then | the Current Resource has nothing to redo |

## `UD-008` Keeping each Resource's changes apart

| Step | Statement |
| --- | --- |
| Given | an edit of `ep01`, then `ep02` selected and edited |
| When | `ep01` is selected again and its change undone |
| Then | `ep01.srt` reads as before its edit and `ep02.srt` keeps its edit |

## `UD-009` Undoing at most 100 changes

| Step | Statement |
| --- | --- |
| Given | 101 edits of `ep01.srt`, from `0` through `101` |
| When | every change there is to undo is undone |
| Then | `ep01.srt` reads `1` |

## `UD-010` Forgetting the changes of a subtitle changed elsewhere

| Step | Statement |
| --- | --- |
| Given | an edit of `ep01.srt`, which is then changed elsewhere and read again |
| When | the Current Resource is asked what it can undo |
| Then | it has nothing to undo |

## `UD-018` Refusing an undo over a subtitle changed elsewhere

An undo puts back what Tsuzuri kept, so over a change made elsewhere it would drop that change unkept; it reads the subtitle again instead, as an edit does.

| Step | Statement |
| --- | --- |
| Given | an edit of `ep01.srt` from `你好` to `您好`, then `ep01.srt` changed elsewhere to `外面改的` |
| When | the change is undone |
| Then | it is refused as `changed-elsewhere`, `ep01.srt` reads `外面改的`, and nothing is left to undo |

## `UD-011` Undoing without a Backup

| Step | Statement |
| --- | --- |
| Given | a Project keeping Backups, with an edit of `ep01.srt` from `你好` |
| When | the change is undone |
| Then | `.tsuzuri/history/` holds only the Overwrite the edit kept, reading `你好` |

## `UD-012` Leaving out an edit that changes nothing

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `你好` |
| When | its text is edited to `你好` |
| Then | the Current Resource has nothing to undo |

## `UD-013` Leaving an undo inside a text field to the field

| Step | Statement |
| --- | --- |
| Given | focus in a Segment's text field |
| When | Ctrl+Z is pressed |
| Then | the Project is not asked to undo |

## `UD-014` Undoing the Project's change outside a text field

| Step | Statement |
| --- | --- |
| Given | focus outside any text field |
| When | Ctrl+Z is pressed |
| Then | the Project is asked to undo |

## `UD-015` Redoing with the redo shortcuts

| Step | Statement |
| --- | --- |
| Given | focus outside any text field |
| When | Ctrl+Shift+Z or Ctrl+Y is pressed |
| Then | the Project is asked to redo, once for each |

## `UD-016` Undoing from the Edit menu

| Step | Statement |
| --- | --- |
| Given | focus outside any text field |
| When | Undo is chosen from the Edit menu |
| Then | the Project is asked to undo |

## `UD-017` Undoing typing from the Edit menu

| Step | Statement |
| --- | --- |
| Given | focus in a Segment's text field |
| When | Undo is chosen from the Edit menu |
| Then | the field undoes its own typing and the Project is not asked to undo |
