# Editing

Correcting the Project in the transcript panel, where every edit is written to Rust, and exporting it as SRT - the original text, or the translation or a Bilingual SRT when there is one.

## Includes

- `src/controllers/transcript_controller.test.ts`
- `src/controllers/project_controller.test.ts`
- `src/controllers/segment_changes_controller.test.ts`
- `src/controllers/speakers_controller.test.ts`
- `src/controllers/retranslation_controller.test.ts`
- `src/controllers/field_controller.test.ts`
- `src/editor/*.test.ts`

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

## `ED-007` Saying an edit was saved

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | a Segment's text is edited |
| Then | a Notification says the edit was saved |

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
| Then | a Notification says the time cannot be read and nothing is changed |

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

## `ED-021` Clearing the checks once the Segments change

A change redraws the rows, so a check kept across it would name rows that moved.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first two Segments checked |
| When | the third Segment is deleted from its menu |
| Then | no Segment is checked and the bar for Checked Segments is hidden |

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
| Then | the notice that the edit was saved offers to add `co` to the Translation Glossary |

## `ED-023` Not offering a Speaker the Translation Glossary names

| Step | Statement |
| --- | --- |
| Given | a Project whose Translation Glossary names the Speaker `小明` |
| When | the first Segment's Speaker is set to `小明` |
| Then | the notice that the edit was saved offers nothing |

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

## `ED-031` Leaving Enter to an input method while it composes

| Step | Statement |
| --- | --- |
| Given | a text field where an input method is composing text |
| When | Enter is pressed to pick a candidate, even where the platform ends the composition before the key arrives |
| Then | no line break is typed and the input method keeps the key |

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
| When | translating the second Segment again is chosen from its menu |
| Then | the Project is asked to translate Segment 1 again, and the progress shows a translation running |

## `ED-040` Translating the Checked Segments again

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation, its first and third Segments checked |
| When | translating them again is chosen |
| Then | the Project is asked to translate Segments 0 and 2 again |
