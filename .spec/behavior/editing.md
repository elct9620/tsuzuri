# Editing

Correcting the Project in the transcript panel, where every edit is written to Rust, and exporting it as SRT - the original text, or the translation or a Bilingual SRT when there is one.

## Includes

- `src/controllers/transcript_controller.test.ts`
- `src/controllers/project_controller.test.ts`
- `src/controllers/segment_changes_controller.test.ts`
- `src/controllers/speakers_controller.test.ts`
- `src/controllers/retranslation_controller.test.ts`
- `src/controllers/field_controller.test.ts`
- `src/controllers/timeline_controller.test.ts`
- `src/controllers/replacement_controller.test.ts`
- `src/editor/*.test.ts`
- `src-tauri/src/replacement.rs`
- `src-tauri/src/project/current.rs`

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

## `ED-065` Deleting the Checked Segments

Deleting the Checked Segments at once is one change, so a single undo brings them all back.

| Step | Statement |
| --- | --- |
| Given | three Segments, the first and third checked |
| When | deleting is chosen from the bar for Checked Segments |
| Then | the Project is asked to delete Segments 0 and 2 as one change |

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

## `ED-092` Holding only the translations of the Segments translated again

| Step | Statement |
| --- | --- |
| Given | a Project whose second Segment is being translated again into the Language it shows |
| When | the panel shows its Segments |
| Then | the second translation field is disabled and the first is not |

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
| When | translating the second Segment again is chosen from its menu |
| Then | the Project is asked to translate Segment 1 again, and the progress shows a translation running |

## `ED-040` Translating the Checked Segments again

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation, its first and third Segments checked |
| When | translating them again is chosen |
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
