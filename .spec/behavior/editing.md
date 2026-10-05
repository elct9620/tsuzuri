# Editing

Correcting the Project in the transcript panel, where every edit is written to Rust, and exporting it as SRT or Plain Text - the original text, or the translation or both when there is one.

## Includes

- `src/controllers/transcript-controller.test.ts`
- `src/components/EditorBar.test.ts`
- `src/components/ExportMenu.test.ts`
- `src/components/ResourceList.test.ts`
- `src/controllers/segment-changes-controller.test.ts`
- `src/controllers/speakers-controller.test.ts`
- `src/components/TranslationDialog.test.ts`
- `src/controllers/field-controller.test.ts`
- `src/controllers/time-field-controller.test.ts`
- `src/controllers/timeline-controller.test.ts`
- `src/components/ReplacementDialog.test.ts`
- `src/controllers/cleanup-controller.test.ts`
- `src/components/SearchBar.test.ts`
- `src/editor/*.test.ts`
- `src-tauri/src/replacement.rs`
- `src-tauri/src/project/current/tests/editing_behavior.rs`

## `ED-001` Writing an edited text to the Project

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | a Segment's text is edited |
| Then | the edit is written to the Project by the Segment's position |

## `ED-002` Writing an edited translation to the Project

| Step | Statement |
| --- | --- |
| Given | a translated Project in the panel |
| When | a Segment's translation is edited |
| Then | the edit is written to the Project as its translation |

## `ED-003` Exporting the Project

| Step | Statement |
| --- | --- |
| Given | a translated Project in the panel |
| When | it is exported as a Bilingual SRT |
| Then | the Project is saved as bilingual to the chosen file |

## `ED-155` Exporting the Project as Plain Text

| Step | Statement |
| --- | --- |
| Given | a translated Project in the panel |
| When | its translation is exported as Plain Text |
| Then | the save dialog opens at its Plain Text default path and the translation is saved as Plain Text with its Speakers and blank lines |

## `ED-156` Leaving the Speakers out of a Plain Text export

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with Speakers turned off for Plain Text |
| When | it is exported as Plain Text |
| Then | it is saved as Plain Text without its Speakers |

## `ED-157` Keeping the Speakers choice for Plain Text on this machine

| Step | Statement |
| --- | --- |
| Given | Speakers turned off for Plain Text |
| When | the app opens again |
| Then | the export menu still has Speakers turned off for Plain Text |

## `ED-162` Leaving the blank lines out of a Plain Text export

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with blank lines turned off for Plain Text |
| When | it is exported as Plain Text |
| Then | it is saved as Plain Text without blank lines |

## `ED-163` Keeping the blank lines choice for Plain Text on this machine

| Step | Statement |
| --- | --- |
| Given | blank lines turned off for Plain Text |
| When | the app opens again |
| Then | the export menu still has blank lines turned off for Plain Text |

## `ED-185` Offering no export for a Project without Segments

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with no Segments |
| When | the export menu is opened |
| Then | every export is disabled |

## `ED-186` Offering only the original's exports before a translation

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose Segments have no translation |
| When | the export menu is opened |
| Then | only the original's SRT and Plain Text are enabled |

## `ED-004` Showing another translation in the editor

| Step | Statement |
| --- | --- |
| Given | a Current Resource with `en` and `ja` translations in the editor |
| When | `ja` is chosen as the translation shown |
| Then | its `ja` translation is shown |

## `ED-005` Leaving room for a translation not yet made

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing `en` whose second Segment has no translation |
| When | the editor shows it |
| Then | the second Segment has an empty translation field |

## `ED-006` Saying an edit was not written

| Step | Statement |
| --- | --- |
| Given | a Project whose subtitle was changed elsewhere since it was read |
| When | a Segment is edited |
| Then | a Notification says the edit was not written and the subtitle was read again |

## `ED-007` Marking an edit as saved

Every field left writes an edit, so a Notification for each would pile up over the Segments being edited.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | a Segment's text is edited |
| Then | the Save Mark shows and no Notification says the edit was saved |

## `ED-008` Showing Placeholders until a transcription writes a Segment

| Step | Statement |
| --- | --- |
| Given | a Current Resource with no Segments in the panel |
| When | its transcription begins |
| Then | the editor shows Placeholder rows |

## `ED-009` Showing a Placeholder over the Batch being translated

Only the Batch the Model works on is about to change, so a Placeholder there shows where the next translations land while the rest stay readable.

| Step | Statement |
| --- | --- |
| Given | a Current Resource of three untranslated Segments being translated, its first two the Batch being translated |
| When | the editor shows it |
| Then | the first two translations are Placeholders and the third is not |

## `ED-041` Showing each Batch's translations as they are written

The translation being written is held from typing, and a held field is still the field its translation is shown in.

| Step | Statement |
| --- | --- |
| Given | a Current Resource of fifteen Segments being translated, shown with no translation yet |
| When | the first six are translated |
| Then | the editor shows their translations while the other nine stay empty |

## `ED-010` Showing Placeholders while another Resource is read

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | another Resource is selected |
| Then | the editor shows Placeholder rows until that Resource is read |

## `ED-011` Leaving the Placeholders when a Resource cannot be read

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with a Resource that cannot be read |
| When | that Resource is selected |
| Then | the Project is read again, so the editor shows what it holds |

## `ED-012` Naming a new Speaker for a Segment

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | `co` is typed as a new name in the first Segment's Speaker menu |
| Then | the edit is written to the Project as its Speaker |

## `ED-013` Offering every Speaker whatever a Segment names

A choice limited to names like the one already set would hide the others, the very ones a correction reaches for.

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose Segments are said by `co` and `cl`, in a Project whose Translation Glossary names the Speaker `小明` |
| When | the Speaker menu of a Segment said by `co` is opened |
| Then | it offers `cl`, `co` and `小明`, with `co` marked as chosen |

## `ED-032` Choosing a Speaker from the menu

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose Segments are said by `co` and `cl` |
| When | `cl` is chosen in the Speaker menu of a Segment said by `co` |
| Then | the edit is written to the Project with `cl` as its Speaker |

## `ED-033` Clearing a Segment's Speaker

| Step | Statement |
| --- | --- |
| Given | a Segment said by `co` |
| When | clearing is chosen in its Speaker menu |
| Then | the edit is written to the Project with no Speaker |

## `ED-014` Changing a Segment's times in the editor

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment runs from 0 to 1 second |
| When | its start is changed to `00:00:00.500` |
| Then | the Project is asked to change its times to 0.5 to 1 second |

## `ED-015` Refusing a time that cannot be read

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | a Segment's start is changed to `abc` |
| Then | a Notification says the time cannot be read, goes on its own, and nothing is changed |


## `ED-109` Carrying a time past its part's range

A part past its range carries into the part above it, as Aegisub reads a time, so a digit typed over any part still gives a time.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment runs from 0 to 1 second |
| When | its end is changed to `00:00:75.000` |
| Then | the Project is asked to change its times to 0 to 75 seconds |

## `ED-145` Holding a time within the longest one written

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment runs from 0 to 1 second |
| When | its end is changed to `99:99:99.999` |
| Then | the Project is asked to change its end to `99:59:59.999` |

## `ED-108` Typing a time over the digit at the caret

A time field takes a time as Aegisub's does: each digit overwrites the one at the caret and the caret moves on, hopping the separators, so a time is typed without its separators and never loses its shape.

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:00.000`, the caret before its minutes |
| When | `1`, `2`, `3`, `1`, `1` and `1` are typed |
| Then | it reads `00:12:31.110` with the caret before its last digit |

## `ED-111` Typing over a selected time from where the selection starts

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, all of it selected as Tab leaves it |
| When | `1` is typed |
| Then | it reads `10:00:32.360` with the caret after the `1` |

## `ED-146` Carrying a digit typed past its part's range

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:00.000`, the caret before its minutes |
| When | `7` is typed |
| Then | it reads `01:10:00.000` with the caret after the first digit of its minutes |

## `ED-147` Typing nothing past the end of a time

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, the caret after its last digit |
| When | `5` is typed |
| Then | it still reads `00:00:32.360` |

## `ED-148` Hopping a separator by typing it

A separator typed moves the caret over the separator in front of it and writes nothing.

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, the caret before the colon after its hours |
| When | `:` is typed |
| Then | it still reads `00:00:32.360` with the caret before its minutes |

## `ED-149` Stepping back over a time with Backspace

Backspace moves the caret back one place and removes nothing, and Delete does nothing, so no key leaves a time with a digit missing.

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, the caret before its seconds |
| When | Backspace and then Delete are pressed |
| Then | it still reads `00:00:32.360` with the caret after its minutes |

## `ED-150` Ignoring a key that is no part of a time

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360` |
| When | `a` is typed |
| Then | it still reads `00:00:32.360` |

## `ED-153` Leaving a time as it is after composing text in it

An input method hands its keys to its own composition rather than to the field, so what it composes is taken back once it ends, as Aegisub refuses any character that is no part of a time.

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, the caret before its minutes |
| When | an input method composes `ㄅ` in it and ends |
| Then | it reads `00:00:32.360` with the caret before its minutes |

## `ED-151` Pasting a time over a time field

A time pasted takes the place of the whole field, selected, and text that is not a time leaves it as it is.

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360` |
| When | `00:01:02,500` and then `abc` are pasted into it |
| Then | it reads `00:01:02.500`, all of it selected |

## `ED-152` Cutting from a time field without removing anything

| Step | Statement |
| --- | --- |
| Given | a Segment's start reading `00:00:32.360`, all of it selected |
| When | it is cut |
| Then | `00:00:32.360` is copied and it still reads `00:00:32.360` |

## `ED-097` Refusing a typed start before the previous Segment's start

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose Segments run from 1 to 2 and from 3 to 4 seconds |
| When | the second's start is changed to `00:00:00.500` |
| Then | a Notification says a Segment cannot start before the one before it or after the one after it, and nothing is changed |

## `ED-112` Pushing the end past a typed start

A time typed past the other edge carries it along, as Aegisub keeps a line's times in order, so a start typed into a Segment that runs no time moves its end with it.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment runs from 1 to 2 seconds |
| When | its start is changed to `00:00:03.000` |
| Then | the Project is asked to change its times to 3 to 3 seconds |

## `ED-154` Pulling the start back before a typed end

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment runs from 1 to 2 seconds |
| When | its end is changed to `00:00:00.500` |
| Then | the Project is asked to change its times to 0.5 to 0.5 seconds |

## `ED-016` Inserting a Segment from its menu

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | inserting below is chosen from the first Segment's menu |
| Then | the Project is asked to insert a Segment after it |

## `ED-017` Splitting a Segment where its text is being edited

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment reads `你好世界`, its text left with the Cursor after `你好` |
| When | splitting is chosen from its menu |
| Then | the Project is asked to split it after two characters |

## `ED-043` Splitting a Segment by shortcut while its text is edited

Subtitle editors bind splitting to a modified line break, so a long cue can be split without leaving the keyboard: Ctrl+Alt+Enter, or ⌘+Option+Enter on macOS.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment reads `你好世界`, with the Cursor after `你好` in its text |
| When | Ctrl+Alt+Enter is pressed |
| Then | the Project is asked to split it after two characters |

## `ED-053` Moving to the second half after a split

Editing goes on from where the text was cut, which is the start of the second half.

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界`, current with the Cursor after `你好` |
| When | it is split there |
| Then | the second Segment, reading `世界`, is current, with the Cursor at the start of its text |

## `ED-118` Keeping the rows already drawn when a Segment is split

Chromium reports a selection change for each time field drawn, so a change keeps the rows there are and adds only those it lacks.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with two Segments |
| When | the first Segment is split |
| Then | the two rows drawn before stay in the list, and one row is added after them |

## `ED-119` Showing the first half's text in the text left by a split

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界`, its text with focus and the Cursor after `你好` |
| When | it is split there |
| Then | the first Segment's text reads `你好` |

## `ED-120` Writing no text before splitting the second half again

The second half is entered as the split leaves it, whether or not its text gets focus in time to say so.

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界` split after `你好`, the Cursor after `世` in `世界` |
| When | it is split there with nothing typed |
| Then | the Project is asked for the split alone |

## `ED-121` Putting back the second half's text with Esc after a split

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界` split after `你好`, the Cursor at the start of `世界` |
| When | Esc is pressed in that text |
| Then | the text is put back as `世界` |

## `ED-159` Entering the second half past the spaces a split leaves

The Project starts the second half past the spaces at the split, so the text the editor enters it with starts there too.

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `Hello world` split after `Hello` |
| When | the second half's text is left with nothing typed |
| Then | the Project is asked for the split alone |

## `ED-054` Keeping the Cursor when a split fails

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界`, current with the Cursor after `你好` |
| When | the Project refuses to split it |
| Then | the first Segment stays current, with the Cursor after `你好` |

## `ED-018` Merging the Checked Segments

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first two Segments checked |
| When | merging is chosen |
| Then | the Project is asked to merge the first through the second |

## `ED-019` Shifting the Checked Segments

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its second and third Segments checked |
| When | they are shifted by 500 milliseconds |
| Then | the Project is asked to shift the second through the third by 500 milliseconds |

## `ED-020` Merging only Segments next to each other

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first and third Segments checked |
| When | the bar for Checked Segments shows |
| Then | merging is not offered |

## `ED-171` Merging the Current Segment with the one before by shortcut

A sentence cut apart by transcription is joined back line by line while proofreading, so Ctrl+Alt+Up, or ⌘+Option+Up on macOS, merges the Current Segment with the one before it: the keys of a split, with the direction to merge. They work in a text field too, since a merge needs no Cursor.

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the second current |
| When | Ctrl+Alt+Up is pressed |
| Then | the Project is asked to merge the first through the second |

## `ED-172` Merging the Current Segment with the one after by shortcut

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the second current |
| When | Ctrl+Alt+Down is pressed |
| Then | the Project is asked to merge the second through the third |

## `ED-173` Merging by shortcut while a text is edited

| Step | Statement |
| --- | --- |
| Given | the interface on macOS, three Segments, with focus in the second Segment's text |
| When | ⌘+Option+Down is pressed |
| Then | the Project is asked to merge the second through the third |

## `ED-182` Writing a text still being typed before merging

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, with `你好` typed into the second Segment's text and not yet written |
| When | Ctrl+Alt+Down is pressed |
| Then | the Project is asked to write `你好` into the second Segment, then to merge the second through the third |

## `ED-174` Merging nothing before the first Segment

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the first current |
| When | Ctrl+Alt+Up is pressed |
| Then | no Segments are merged |

## `ED-175` Leaving the merge shortcuts to an open dialog

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the second current, with a dialog open over the editor |
| When | Ctrl+Alt+Up is pressed |
| Then | no Segments are merged |

## `ED-176` Merging nothing by shortcut while a Mode holds the Segments

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the second current, while a transcription runs on the Current Resource |
| When | Ctrl+Alt+Up is pressed |
| Then | no Segments are merged |

## `ED-177` Merging once for a held merge shortcut

| Step | Statement |
| --- | --- |
| Given | the interface on Linux, three Segments, the second current |
| When | Ctrl+Alt+Up is held down until it repeats |
| Then | the Project is asked to merge the first through the second once |

## `ED-178` Merging a Segment with the one before from its menu

| Step | Statement |
| --- | --- |
| Given | three Segments |
| When | merging with the one before is chosen from the second Segment's menu |
| Then | the Project is asked to merge the first through the second |

## `ED-179` Merging a Segment with the one after from its menu

| Step | Statement |
| --- | --- |
| Given | three Segments |
| When | merging with the one after is chosen from the second Segment's menu |
| Then | the Project is asked to merge the second through the third |

## `ED-180` Offering no merge past either end

| Step | Statement |
| --- | --- |
| Given | three Segments |
| When | the first and the last Segment's menus are read |
| Then | the first offers no merge with the one before, and the last none with the one after |

## `ED-181` Showing the merge shortcuts in a Segment's menu

| Step | Statement |
| --- | --- |
| Given | the interface on Linux |
| When | the second of three Segments' menu is read |
| Then | merging with the one before reads `Ctrl+Alt+↑` beside it, and with the one after `Ctrl+Alt+↓` |

## `ED-065` Deleting the Checked Segments

Deleting the Checked Segments at once is one change, so a single undo brings them all back.

| Step | Statement |
| --- | --- |
| Given | three Segments, the first and third checked |
| When | deleting is chosen from the bar for Checked Segments |
| Then | the Project is asked to delete Segments 0 and 2 as one change |

## `ED-098` Deleting the Current Segment with Delete

Proofreading line by line, reaching for a menu to drop a stray line is slow, so Delete deletes the Current Segment where no text is typed, as subtitle editors do. A single undo brings it back, so nothing asks first.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current, with focus outside any text field |
| When | Delete is pressed |
| Then | the Project is asked to delete Segment 1 |

## `ED-099` Deleting the Checked Segments with Delete

Checked Segments are the ones chosen to act on, so Delete takes them over the Current Segment.

| Step | Statement |
| --- | --- |
| Given | three Segments, the first and third checked and the second current, with focus outside any text field |
| When | Delete is pressed |
| Then | the Project is asked to delete Segments 0 and 2 as one change |

## `ED-100` Deleting with Backspace on macOS

The key a Mac keyboard labels delete types Backspace, and a forward Delete takes Fn with it, so both delete there.

| Step | Statement |
| --- | --- |
| Given | the interface on macOS, three Segments, the second current, with focus outside any text field |
| When | Backspace is pressed |
| Then | the Project is asked to delete Segment 1 |

## `ED-101` Leaving Delete to a text field

| Step | Statement |
| --- | --- |
| Given | three Segments, with focus in the second Segment's text |
| When | Delete is pressed |
| Then | no Segment is deleted and the key is left to the field |

## `ED-102` Leaving Delete to an open dialog

Focus in a dialog, a menu or a drop-down list means the user is working there, so Delete does not reach past it to the Segments.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current, with a dialog open over the editor |
| When | Delete is pressed |
| Then | no Segment is deleted |

## `ED-103` Leaving Delete to a menu or a list with focus

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current, with focus on the second Segment's menu |
| When | Delete is pressed |
| Then | no Segment is deleted |

## `ED-104` Deleting nothing while a Mode holds the Segments

A running Mode holds the Segments from being deleted from a menu, and Delete follows the same hold.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current, while a transcription runs on the Current Resource |
| When | Delete is pressed |
| Then | no Segment is deleted |

## `ED-105` Deleting one Segment for a held key

The Current Segment moves only once the deletion shows, so a key repeating before then would delete by a place already gone.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current, with focus outside any text field |
| When | Delete is held down until it repeats |
| Then | the Project is asked to delete Segment 1 once |

## `ED-106` Leaving Delete alone with nothing to delete

| Step | Statement |
| --- | --- |
| Given | three Segments, none current or checked |
| When | Delete is pressed |
| Then | no Segment is deleted and the key is left to the page |

## `ED-096` Showing the split shortcut in a Segment's menu

| Step | Statement |
| --- | --- |
| Given | the interface on Linux |
| When | a Segment's menu is read |
| Then | splitting at the Cursor reads `Ctrl+Alt+Enter` beside it |

## `ED-107` Showing the delete shortcut in a Segment's menu

| Step | Statement |
| --- | --- |
| Given | the interface on Linux |
| When | a Segment's menu is read |
| Then | deleting reads `Delete` beside it |

## `ED-066` Checking every Segment by shortcut

Checking rows one by one is slow across a long transcript, so Ctrl+A, or ⌘+A on macOS, checks them all where no text is being typed.

| Step | Statement |
| --- | --- |
| Given | three Segments, with focus outside any text field |
| When | Ctrl+A is pressed |
| Then | the three Segments are checked and the bar for Checked Segments shows them |

## `ED-067` Leaving Ctrl+A to a text field

| Step | Statement |
| --- | --- |
| Given | three Segments, with focus in the first Segment's text |
| When | Ctrl+A is pressed |
| Then | no Segment is checked and the key is left to the field |

## `ED-068` Checking every Segment from the Edit menu

The macOS Edit menu takes ⌘+A before the webview sees it, so Select All chosen there does what the shortcut does.

| Step | Statement |
| --- | --- |
| Given | three Segments, with focus outside any text field |
| When | Select All is chosen from the Edit menu |
| Then | the three Segments are checked |

## `ED-069` Selecting a text field's text from the Edit menu

| Step | Statement |
| --- | --- |
| Given | three Segments, with focus in the first Segment's text |
| When | Select All is chosen from the Edit menu |
| Then | the field's text is selected and no Segment is checked |

## `ED-021` Clearing the checks once the Segments change

A change redraws the rows, so a check kept across it would name rows that moved.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first two Segments checked |
| When | the third Segment is deleted from its menu |
| Then | no Segment is checked and the bar for Checked Segments is hidden |

## `ED-158` Keeping the checks made after a change that moved nothing

A change that keeps the Segments' number never moves a row, so it clears the checks as soon as it is written; one that left the Segments as they were is then done with, and a later edit is not taken for it.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment's times were written as they already were |
| When | its second Segment is checked and the first Segment's text is written |
| Then | the second Segment stays checked |

## `ED-071` Checking the Segments through a row clicked with Shift

Subtitle editors check a run of lines by Shift-clicking its other end, as a list does. The Current Segment is that run's fixed end, so it stays current and another Shift-click resizes the run up or down.

| Step | Statement |
| --- | --- |
| Given | four Segments, the second current and the fourth checked |
| When | the third row is clicked with Shift held |
| Then | the second and third Segments are checked and no others, and the second stays current |

## `ED-072` Checking upward from the Current Segment

| Step | Statement |
| --- | --- |
| Given | three Segments, the third current |
| When | the first row is clicked with Shift held |
| Then | the first through the third Segments are checked |

## `ED-073` Making a row current with Shift when no Segment is

| Step | Statement |
| --- | --- |
| Given | three Segments, none current |
| When | the second row is clicked with Shift held |
| Then | the second Segment is current and none is checked |

## `ED-055` Moving into a Segment inserted from a menu

A Segment is inserted to be written, so its text is entered at once.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first Segment current |
| When | inserting below is chosen from the first Segment's menu |
| Then | the new second Segment is current, with the Cursor in its empty text |

## `ED-056` Moving into a Segment drawn on the timeline

A Segment drawn on the timeline is inserted to be written, as one inserted from a menu is.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first Segment current |
| When | a range drawn on the timeline after the last Segment is inserted |
| Then | the new last Segment is current, with the Cursor in its empty text |

## `ED-057` Moving to the next Segment when the current one is deleted

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current |
| When | the second is deleted from its menu |
| Then | the Segment that was third, now second, is current |

## `ED-058` Moving to the previous Segment when the last one is deleted

| Step | Statement |
| --- | --- |
| Given | three Segments, the third current |
| When | the third is deleted from its menu |
| Then | the second Segment is current |

## `ED-070` Moving past every Segment deleted

| Step | Statement |
| --- | --- |
| Given | four Segments, the second and third checked and the second current |
| When | they are deleted |
| Then | the Segment that was fourth, now second, is current |

## `ED-059` Keeping the merged Segment current

| Step | Statement |
| --- | --- |
| Given | three Segments, the second and third checked and the third current |
| When | they are merged |
| Then | the merged second Segment is current |

## `ED-063` Keeping the Current Segment on its Segment when others before it are merged

| Step | Statement |
| --- | --- |
| Given | four Segments, the first and second checked and the fourth current |
| When | they are merged |
| Then | the Segment that was fourth, now third, is current |

## `ED-060` Leaving no Current Segment when the Segments change in number elsewhere

A change made elsewhere, such as an undo, a redo, a restore or a transcription, does not say which Segments it added or took away, so a Current Segment kept across it could stand on another Segment.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current |
| When | an undo brings back a fourth |
| Then | no Segment is current |

## `ED-064` Keeping the Current Segment when the Segments change elsewhere but not in number

Keeping as much of where the user was as the change allows is what makes a change elsewhere cheap to follow.

| Step | Statement |
| --- | --- |
| Given | three Segments, the second current |
| When | an undo takes back an edit of the first Segment's text |
| Then | the second Segment stays current |

## `ED-022` Offering to add a new Speaker to the Translation Glossary

Registering a Speaker gives it a name in every Language and lets the editor offer it later.

| Step | Statement |
| --- | --- |
| Given | a Project whose Translation Glossary names no Speaker `co` |
| When | the first Segment's Speaker is set to `co` |
| Then | a Notification says the edit was saved and offers to add `co` to the Translation Glossary |

## `ED-023` Not offering a Speaker the Translation Glossary names

| Step | Statement |
| --- | --- |
| Given | a Project whose Translation Glossary names the Speaker `小明` |
| When | the first Segment's Speaker is set to `小明` |
| Then | the Save Mark shows and no Notification says the edit was saved |

## `ED-024` Adding a new Speaker to the Translation Glossary

| Step | Statement |
| --- | --- |
| Given | the offer to add `co`, in a Project in `zh-TW` whose Translation Glossary holds the row `東京`, `Tokyo`, empty |
| When | it is accepted |
| Then | the rows are sent to be saved with `co` in the `zh-TW` column, naming a Speaker, after `東京` |

## `ED-025` Marking a term already in the Translation Glossary as a Speaker

| Step | Statement |
| --- | --- |
| Given | the offer to add `co`, in a Project in `zh-TW` whose Translation Glossary holds the row `co`, empty, empty naming no Speaker |
| When | it is accepted |
| Then | the rows are sent to be saved with that row naming a Speaker and no other |

## `ED-026` Holding every field while the Current Resource is transcribed

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource is being transcribed |
| When | the panel shows its Segments |
| Then | every text, translation, Speaker and time field is disabled |

## `ED-027` Holding only the translation while it is written

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource is being translated into the Language it shows |
| When | the panel shows its Segments |
| Then | each translation field is disabled and each text field is not |

## `ED-092` Holding only the translations of the Segments translated again

| Step | Statement |
| --- | --- |
| Given | a Project whose second Segment is being translated again into the Language it shows |
| When | the panel shows its Segments |
| Then | the second translation field is disabled and the first is not |

## `ED-187` Naming the Current Resource above the editor

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource is `ep01` |
| When | the panel shows its Segments |
| Then | the editor's heading reads `ep01` |

## `ED-188` Offering each translation of the Current Resource to show

| Step | Statement |
| --- | --- |
| Given | a Current Resource with an `en` translation, being translated into `ja` |
| When | the panel shows its Segments |
| Then | the choice of translation offers none, `en` and `ja`, with `ja` chosen |

## `ED-093` Holding the choice of translation while a Mode runs

| Step | Statement |
| --- | --- |
| Given | a Project whose Current Resource is being translated |
| When | the panel shows its Segments |
| Then | the choice of translation to show is disabled |

## `ED-028` Keeping a cue's text plain

A subtitle has no formatting, so what is pasted or typed into a text field stays plain text.

| Step | Statement |
| --- | --- |
| Given | the editor showing a Segment |
| When | its text field is laid out |
| Then | the field takes plain text only and keeps each line break the text has |

## `ED-029` Writing nothing when a text field is left unchanged

| Step | Statement |
| --- | --- |
| Given | a text field the user entered |
| When | it is left without its text changing |
| Then | no edit is written |

## `ED-030` Telling where the selection is in a text field

| Step | Statement |
| --- | --- |
| Given | a text field of two lines with a selection from its first line into its second |
| When | the selection's place is asked |
| Then | each end counts every character before it, the line break included |

## `ED-042` Keeping the Cursor once its text is left

The document holds one selection, which a click elsewhere moves away, so the Cursor is kept for a menu chosen afterwards, as a textarea keeps its own.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | focus moves to the first Segment's menu |
| Then | the Cursor is still after the second character of that text |

## `ED-117` Following the selection as it moves in a text

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | the selection moves after its third character |
| Then | the drawn caret stands after the third character |

## `ED-116` Telling of the Cursor only when it moves

Chromium reports a selection change for each time field a row is drawn with, so one leaving the Cursor in place tells nobody.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | the document reports a selection change that leaves the Cursor there |
| Then | no view is told the Cursor moved |

## `ED-044` Dropping a kept Cursor once its text is replaced

A Cursor kept for one text means nothing in another; the same text written again, as every refresh does, keeps it.

| Step | Statement |
| --- | --- |
| Given | the first Segment reading `你好世界`, its text left with the Cursor after `你好` |
| When | the Project changes that text to `今天天氣很好` |
| Then | no Cursor is kept, and the first Segment stays current |

## `ED-045` Making a Segment current by entering its text

The Cursor belongs to the Current Segment alone, so entering a text by keyboard moves the background with it, as a click does.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first Segment current |
| When | the second Segment's text gets focus |
| Then | the second Segment is the Current Segment, with the Cursor in its text |

## `ED-047` Dropping the Cursor when another Segment is made current

| Step | Statement |
| --- | --- |
| Given | the first Segment's text left with the Cursor after its second character |
| When | the second Segment's region is clicked on the timeline |
| Then | the second Segment is current and no Cursor is kept |

## `ED-048` Asking for a Cursor when another Segment's menu splits

Opening a Segment's menu makes it current, so a Cursor left in another Segment is never split.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text left with the Cursor after its second character |
| When | splitting is chosen from the second Segment's menu |
| Then | nothing is split, a Notification asks for the Cursor first, and the second Segment is current |

## `ED-049` Drawing the Cursor in place of the platform's caret

A menu, and later a floating one, acts on the Cursor after focus has moved to it, when the platform no longer shows a caret; drawing the Cursor itself keeps it looking the same with focus or without.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | the editor shows it |
| Then | the field hides the platform's caret and selection, and the drawn caret stands after the second character |

## `ED-122` Keeping the drawn caret on its character as the text moves in its row

The caret is drawn at a place measured once, so it is measured again whenever something drawn beside the text, such as a comparison's marks, moves it.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | marks are drawn above that text in its row |
| Then | the drawn caret stands after the second character where the text now is |

## `ED-091` Drawing the Cursor at the start of a line typed into a text

A caret between a line break and the text after it stands at the start of the next line, as in any editor, however the text was typed.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text typed to `你好`, a line break and `世界` |
| When | the Cursor is moved before `世` |
| Then | the drawn caret stands at the start of the second line |

## `ED-050` Holding a kept Cursor still

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with the Cursor after its second character |
| When | focus moves to the first Segment's menu |
| Then | the drawn caret stays after the second character, marked as kept so it no longer blinks |

## `ED-051` Drawing a range of text as the Cursor

A range is shown as the platforms show one, without a caret; a split takes its start.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with its second and third characters selected |
| When | the editor shows it |
| Then | those two characters are marked as the Cursor's range and no caret is drawn |

## `ED-052` Leaving no Current Segment when another Resource is selected

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first Segment current and the Cursor in its text |
| When | another Resource is selected |
| Then | no Segment is current and no Cursor is kept |

## `ED-061` Making a Segment current from any of its fields

Any focus within a row makes its Segment current; only a text or a translation holds the Cursor.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first Segment current |
| When | the second Segment's start time gets focus |
| Then | the second Segment is current and no Cursor is kept |

## `ED-062` Dropping the Cursor when a Mode holds its text

| Step | Statement |
| --- | --- |
| Given | the first Segment's text left with the Cursor after its second character |
| When | a transcription of the Current Resource starts |
| Then | the first Segment stays current and no Cursor is kept |

## `ED-160` Writing a text typed before a Mode took its Cursor

What was typed is written as the field is left even once a Mode holds it, so a refusal is told rather than the typing lost unsaid.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered and typed to read `你好世界啊` |
| When | a transcription of the Current Resource starts and the text is left |
| Then | the Project is asked to write `你好世界啊` into the first Segment's text |

## `ED-161` Writing nothing typed into a Segment another change moved

A change made elsewhere to how many Segments there are may move the one typed in, so what was typed is no longer written where it was entered.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered and typed to read `你好世界啊` |
| When | a Segment is inserted before it by another change and the text is left |
| Then | nothing is written |

## `ED-077` Putting back a text's entry with Esc

Esc gives up what was typed since the field was entered, as an inline edit in a list does, so a correction gone wrong costs no undo.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered reading `你好`, then typed to `你好嗎` |
| When | Esc is pressed |
| Then | the field reads `你好` again, focus leaves it, no edit is written, and the first Segment stays current with no Cursor kept |

## `ED-078` Leaving Esc to an input method while it composes

| Step | Statement |
| --- | --- |
| Given | a text field where an input method is composing text |
| When | Esc is pressed to give up the composition |
| Then | the field keeps focus and its text, and the input method keeps the key |

## `ED-031` Leaving Enter to an input method while it composes

| Step | Statement |
| --- | --- |
| Given | a text field where an input method is composing text |
| When | Enter is pressed to pick a candidate, even where the platform ends the composition before the key arrives |
| Then | no line break is typed and the input method keeps the key |

## `ED-074` Moving to the next Segment with Enter

Subtitle editors confirm a line with Enter and go on to the next, and break a line with Shift+Enter, so a transcript is corrected line by line without reaching for the mouse; Enter on the numeric keypad is the same key.

| Step | Statement |
| --- | --- |
| Given | the first of two Segments, its text entered and changed |
| When | Enter is pressed |
| Then | no line break is typed, the first text is written, and the second Segment's text is entered |

## `ED-075` Leaving the last Segment's text with Enter

| Step | Statement |
| --- | --- |
| Given | the last Segment's text entered and changed |
| When | Enter is pressed |
| Then | the field is left and its text is written |

## `ED-076` Breaking a line with Shift+Enter

| Step | Statement |
| --- | --- |
| Given | a text field the user entered |
| When | Shift+Enter is pressed |
| Then | a line break is typed at the Cursor and the field keeps focus |

## `ED-094` Leaving out what follows the last character of an edited text

A line break typed at the end of a text leaves one behind that the field no longer shows and that cannot be deleted, and SRT writes no blank line or trailing space anyway, so a text keeps nothing after its last character.

| Step | Statement |
| --- | --- |
| Given | the Segment `你好` |
| When | its text is edited to `您好` followed by a line break and a space |
| Then | the Segment's text is `您好` |

## `ED-095` Leaving out what follows the last character of an edited translation

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing `en`, whose Segment reads `你好` translated as `Hi` |
| When | its translation is edited to `Hello` followed by a line break |
| Then | the Segment's translation is `Hello` |

## `ED-034` Setting the Speaker of the Checked Segments

Setting Speakers one Segment at a time is slow across a long transcript, so the Checked Segments and the whole transcript can be named at once.

| Step | Statement |
| --- | --- |
| Given | three Segments, the first and third checked |
| When | the Speaker dialog opened for the Checked Segments is applied with `co` |
| Then | the Project is asked to set the Speaker of Segments 0 and 2 to `co` |

## `ED-035` Setting the Speaker of every Segment

| Step | Statement |
| --- | --- |
| Given | three Segments |
| When | the Speaker dialog is applied to every Segment with `co` |
| Then | the Project is asked to set the Speaker of Segments 0, 1 and 2 to `co` |

## `ED-036` Naming only the Segments without a Speaker

| Step | Statement |
| --- | --- |
| Given | three Segments, the second said by `cl` |
| When | the Speaker dialog is applied to the Segments without a Speaker with `co` |
| Then | the Project is asked to set the Speaker of Segments 0 and 2 to `co` |

## `ED-037` Renaming a Speaker

| Step | Statement |
| --- | --- |
| Given | three Segments said by `co`, `cl` and `co` |
| When | the Speaker dialog is applied to the Segments said by `co` with `小明` |
| Then | the Project is asked to set the Speaker of Segments 0 and 2 to `小明` |

## `ED-038` Holding a Placeholder after the last Segment while transcribing

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed that holds one Segment so far |
| When | the editor shows it |
| Then | one Placeholder row follows that Segment |

## `ED-039` Translating a Segment again from its menu

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation |
| When | translating the second Segment again is chosen from its menu and started from the dialog |
| Then | the Project is asked to translate Segment 1 again, and the progress shows a translation running |

## `ED-040` Translating the Checked Segments again

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation, its first and third Segments checked |
| When | translating them again is chosen and started from the dialog |
| Then | the Project is asked to translate Segments 0 and 2 again |

## `ED-079` Replacing a text across the Current Resource

Punctuation a transcription put in is corrected across a whole subtitle at once, rather than a Segment at a time.

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose `ep01.srt` reads `你好，世界。` and `再見，朋友。` |
| When | `，` is replaced with a space in the original |
| Then | `ep01.srt` reads `你好 世界。` and `再見 朋友。`, and the answer is 2 |

## `ED-080` Removing a text by replacing it with nothing

| Step | Statement |
| --- | --- |
| Given | the Segments `你好。` and `再見。` |
| When | `。` is replaced with nothing |
| Then | they read `你好` and `再見` |

## `ED-081` Taking the text to find as written

What is typed to find is looked for character by character unless it is marked a regular expression, so a `.` or a `?` in a subtitle is found as itself.

| Step | Statement |
| --- | --- |
| Given | the Segment `真的?好.` |
| When | `.` is replaced with `。` without marking it a regular expression |
| Then | it reads `真的?好。` |

## `ED-082` Replacing by a regular expression with its groups

Rust reads the regular expression, so the syntax is the `regex` crate's alone, with no lookaround or backreference, and a group in the replacement is `$1` or `${1}`, braced where a letter or digit follows.

| Step | Statement |
| --- | --- |
| Given | the Segment `第1集 第12集` |
| When | `第(\d+)集` is replaced as a regular expression with `EP${1}` |
| Then | it reads `EP1 EP12` |

## `ED-083` Refusing a regular expression that cannot be read

| Step | Statement |
| --- | --- |
| Given | the Segment `你好` |
| When | `(` is replaced as a regular expression |
| Then | it is refused as `invalid-pattern` and `ep01.srt` is left as it was |

## `ED-084` Replacing in the translation shown

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing `en`, whose Segments read `你好，世界` and `再見` with the translations `Hello, world` and none |
| When | `,` is replaced with nothing in the translation |
| Then | `ep01.en.srt` reads `Hello world`, the original is left as it was, and the second Segment still has no translation |

## `ED-085` Undoing a replacement at once

| Step | Statement |
| --- | --- |
| Given | the Segments `你好，世界` and `再見，朋友`, whose `，` were replaced with a space |
| When | the change is undone |
| Then | they read `你好，世界` and `再見，朋友` again |

## `ED-086` Writing nothing when nothing matches

| Step | Statement |
| --- | --- |
| Given | the Segment `你好` |
| When | `。` is replaced with nothing |
| Then | the answer is 0, `ep01.srt` is not written and nothing is added to the Undo History |

## `ED-087` Opening the replace dialog by shortcut

Subtitle editors open replacing with Ctrl+H; macOS keeps ⌘+H to hide the app, so there it is ⌘+Option+F, as its editors bind it. A range selected in a text is what is looked for.

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered reading `你好，世界` with `，` selected |
| When | Ctrl+H is pressed |
| Then | the replace dialog opens with `，` as the text to find, and the text to find has focus |

## `ED-183` Not opening the replace dialog without a Project

| Step | Statement |
| --- | --- |
| Given | no Project open |
| When | Ctrl+H, or ⌘⌥F on macOS, is pressed |
| Then | the replace dialog stays closed and the key goes on to the page |

## `ED-088` Replacing from the dialog with Enter

The dialog is kept to the keyboard: Enter in either box replaces, as Esc closes it.

| Step | Statement |
| --- | --- |
| Given | the replace dialog with `，` to find, a space to replace it with, the translation chosen and the regular expression marked |
| When | Enter is pressed in the text to replace with |
| Then | the Project is asked to replace `，` with a space in the translation as a regular expression, the dialog closes, and a Notification says how many were replaced |

## `ED-089` Keeping the dialog open when nothing matches

| Step | Statement |
| --- | --- |
| Given | the replace dialog with `。` to find |
| When | it is applied and the Project answers that nothing was replaced |
| Then | the dialog stays open and a Notification says nothing matched |

## `ED-090` Not offering to translate again without a translation shown

Translating again writes into the translation shown, so without one it is not offered at all.

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing no translation, its first Segment checked |
| When | the editor shows it |
| Then | neither the Segment menu nor the bar for Checked Segments offers translating again |

## `ED-113` Shifting nothing while the offset is empty

| Step | Statement |
| --- | --- |
| Given | Checked Segments and the shift dialog with its offset cleared |
| When | the shift is started |
| Then | nothing is shifted and the dialog stays open |

## `ED-114` Shifting nothing once no Segment is checked

| Step | Statement |
| --- | --- |
| Given | the shift dialog open with an offset of 500 ms |
| When | every check is cleared and the shift is started |
| Then | nothing is shifted |

## `ED-115` Putting back a text's entry with Esc after a refused split

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered reading `大家好`, then typed to `大家好啊` |
| When | a split is refused as its text is written, then Esc is pressed |
| Then | the field reads `大家好` again |

## `ED-123` Cleaning Simplified Chinese out of chosen Segments

What a Simplified Cleanup cleans is the `zh-TW` text: the original when the Primary Language is `zh-TW`, otherwise the translation shown when it is.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose Segments read `这是测试` and `还没` |
| When | the first Segment is cleaned of Simplified Chinese |
| Then | the original reads `這是測試` and `还没`, and 3 characters are answered as cleaned |

## `ED-124` Cleaning Simplified Chinese out of a chosen range

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose Segment reads `这是测试` |
| When | its characters 2 to 4 are cleaned of Simplified Chinese |
| Then | it reads `这是測試` |

## `ED-125` Cleaning the translation shown when it is in `zh-TW`

| Step | Statement |
| --- | --- |
| Given | a Project in `ja` whose Segment reads `こんにちは`, showing its `zh-TW` translation `你们好` |
| When | the Segment is cleaned of Simplified Chinese |
| Then | the translation reads `你們好` and the original is left as it was |

## `ED-126` Refusing a cleanup with no text in `zh-TW`

| Step | Statement |
| --- | --- |
| Given | a Project in `en` showing no translation |
| When | a Segment is cleaned of Simplified Chinese |
| Then | the cleanup is refused as there is no text in `zh-TW`, and nothing is written |

## `ED-127` Undoing a cleanup at once

| Step | Statement |
| --- | --- |
| Given | two Segments of a Project in `zh-TW` cleaned of Simplified Chinese together |
| When | the change is undone |
| Then | both read as they did before the cleanup |

## `ED-128` Cleaning the Checked Segments by shortcut

The shortcut cleans what the user has marked first: the Checked Segments, then a range the Cursor selects, then the Current Segment.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` with its first and third Segments checked |
| When | Ctrl+Shift+T, or ⌘⇧T on macOS, is pressed |
| Then | the Project is asked to clean the first and third Segments, and a Notification says how many characters were cleaned |

## `ED-129` Cleaning the range the Cursor selects by shortcut

| Step | Statement |
| --- | --- |
| Given | the first Segment's text `这是测试` entered, typed to `这是测试啊` with `测试` selected, and no Segment checked |
| When | the cleanup shortcut is pressed |
| Then | the typed text is written and the field left, and the Project is asked to clean characters 2 to 4 of that text |

## `ED-130` Cleaning the Current Segment by shortcut

| Step | Statement |
| --- | --- |
| Given | the second Segment current, with no range selected and no Segment checked |
| When | the cleanup shortcut is pressed |
| Then | the Project is asked to clean the second Segment |

## `ED-131` Cleaning a Segment from its menu

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` in the panel |
| When | Clean Simplified Chinese is chosen from the second Segment's menu |
| Then | the Project is asked to clean the second Segment |

## `ED-132` Cleaning the Checked Segments from their bar

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` with its first two Segments checked |
| When | Clean Simplified Chinese is chosen from the bar for Checked Segments |
| Then | the Project is asked to clean the first two Segments |

## `ED-133` Not offering a cleanup without a text in `zh-TW`

| Step | Statement |
| --- | --- |
| Given | a Project in `en` showing no translation, its first Segment checked |
| When | the editor shows it |
| Then | neither the Segment menu nor the bar for Checked Segments offers a cleanup |

## `ED-134` Telling that nothing needed cleaning

| Step | Statement |
| --- | --- |
| Given | the Current Segment of a Project in `zh-TW` |
| When | it is cleaned and the Project answers that no character was cleaned |
| Then | a Notification says there was no Simplified Chinese to clean |

## `ED-135` Cleaning what is marked from the Edit menu

On macOS the Edit menu takes the cleanup shortcut before the page sees it, so choosing it there cleans as the shortcut does.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` with its second Segment checked |
| When | Clean Simplified Chinese is chosen from the Edit menu |
| Then | the Project is asked to clean the second Segment |

## `ED-136` Not cleaning by shortcut in a dialog

A dialog holding focus is doing something else, as with deleting by key.

| Step | Statement |
| --- | --- |
| Given | a Checked Segment and a dialog's box holding focus |
| When | the cleanup shortcut is pressed |
| Then | nothing is cleaned and the box keeps focus |

## `ED-137` Finding every match across the Current Resource

What is typed to find is read as a replacement reads it: as written, or as a regular expression of the `regex` crate.

| Step | Statement |
| --- | --- |
| Given | the Segments `你好，世界`, `再見` and `好，走吧` |
| When | `，` is searched for in the original |
| Then | the Project answers the characters 2 to 3 of the first Segment and 1 to 2 of the third |

## `ED-138` Opening the search bar by shortcut

| Step | Statement |
| --- | --- |
| Given | the first Segment's text entered with `，` selected |
| When | Ctrl+F, or ⌘F on macOS, is pressed |
| Then | the search bar opens with `，` to find and focus, every match is marked, and it counts `1/2` |

## `ED-184` Not opening the search bar without a Project

| Step | Statement |
| --- | --- |
| Given | no Project open |
| When | Ctrl+F, or ⌘F on macOS, is pressed |
| Then | the search bar stays closed and the key goes on to the page |

## `ED-139` Moving to the next match

Moving to a match makes its Segment current, so the list scrolls to it and the Preview follows as a click would.

| Step | Statement |
| --- | --- |
| Given | the search bar finding two matches, at the first |
| When | Enter is pressed in it, or F3, or ⌘G on macOS |
| Then | the second match is the current one, its Segment is the Current Segment, and it counts `2/2` |

## `ED-140` Going round from the last match

| Step | Statement |
| --- | --- |
| Given | the search bar at the second of two matches |
| When | Enter is pressed in it |
| Then | the first match is the current one again |

## `ED-141` Moving to the previous match

| Step | Statement |
| --- | --- |
| Given | the search bar at the first of two matches |
| When | Shift+Enter is pressed in it, or Shift+F3, or ⇧⌘G on macOS |
| Then | the second match is the current one |

## `ED-142` Following the Segments as they change

| Step | Statement |
| --- | --- |
| Given | the search bar finding two matches of `，` |
| When | an edit takes one of them away |
| Then | the Project is searched again and it counts one match |

## `ED-143` Closing the search bar

| Step | Statement |
| --- | --- |
| Given | the search bar open with its matches marked |
| When | Esc is pressed in it |
| Then | the bar closes and no match stays marked |

## `ED-144` Telling of a regular expression that cannot be read

| Step | Statement |
| --- | --- |
| Given | the search bar open |
| When | `(` is searched for as a regular expression |
| Then | nothing is marked and the bar says the pattern cannot be read |

## `ED-164` Opening a Segment's menu with a right-click

Subtitle editors offer a line's changes where the pointer is, as Aegisub and Subtitle Edit do on a right-click, so the changes a Segment's menu holds open beside the pointer as a menu of the system, without reaching for the button at the row's end.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with no Segment checked |
| When | the first Segment's row is right-clicked |
| Then | a menu offers what the first Segment's menu offers, in its order |

## `ED-165` Making a right-clicked Segment current

| Step | Statement |
| --- | --- |
| Given | a Project in the panel whose first Segment is current |
| When | the second Segment's row is right-clicked |
| Then | the second Segment is current |

## `ED-166` Changing a Segment from its right-click menu

| Step | Statement |
| --- | --- |
| Given | the menu a right-click on the first Segment's row opened |
| When | inserting below is chosen from it |
| Then | the Project is asked to insert a Segment after the first |

## `ED-167` Opening the checked Segments' changes with a right-click

While Segments are checked, a change chosen applies to every Checked Segment, as the changes offered above the list for them do.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with two Segments checked |
| When | a Segment's row is right-clicked |
| Then | a menu offers the changes offered for the Checked Segments, in their order |

## `ED-168` Offering cut, copy and paste in a text field's right-click menu

The system's menu takes the place of the one the page would show, so a text field keeps the clipboard commands it had.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | the first Segment's original is right-clicked |
| Then | the menu opens with cut, copy and paste ahead of the Segment's changes |

## `ED-169` Showing a shortcut in the right-click menu

| Step | Statement |
| --- | --- |
| Given | the interface on Linux |
| When | a Segment's row is right-clicked |
| Then | splitting at the Cursor carries `Ctrl+Alt+Enter` in the menu |

## `ED-170` Holding a Segment's changes in its right-click menu

| Step | Statement |
| --- | --- |
| Given | a translation running over the first Segment |
| When | its row is right-clicked |
| Then | the changes the running Mode holds are offered disabled |
