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
| Given | a Project in the panel whose first Segment reads `你好世界`, with the cursor after `你好` |
| When | splitting is chosen from its menu |
| Then | the Project is asked to split it after two characters |

## `ED-018` Merging the Segments selected

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first two Segments selected |
| When | merging is chosen |
| Then | the Project is asked to merge the first through the second |

## `ED-019` Shifting the Segments selected

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its second and third Segments selected |
| When | they are shifted by 500 milliseconds |
| Then | the Project is asked to shift the second through the third by 500 milliseconds |

## `ED-020` Merging only Segments next to each other

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first and third Segments selected |
| When | the selection bar shows |
| Then | merging is not offered |

## `ED-021` Clearing the selection once the Segments change

A change redraws the rows, so a selection kept across it would name rows that moved.

| Step | Statement |
| --- | --- |
| Given | a Project in the panel with its first two Segments selected |
| When | the third Segment is deleted from its menu |
| Then | no Segment is selected and the selection bar is hidden |

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

## `ED-030` Telling where the caret is in a text field

| Step | Statement |
| --- | --- |
| Given | a text field of two lines with the caret after the line break |
| When | the caret's place is asked |
| Then | it counts every character before the caret, the line break included |

## `ED-031` Leaving Enter to an input method while it composes

| Step | Statement |
| --- | --- |
| Given | a text field where an input method is composing text |
| When | Enter is pressed to pick a candidate, even where the platform ends the composition before the key arrives |
| Then | no line break is typed and the input method keeps the key |

## `ED-034` Setting the Speaker of the selected Segments

Setting Speakers one Segment at a time is slow across a long transcript, so the selection and the whole transcript can be named at once.

| Step | Statement |
| --- | --- |
| Given | three Segments, the first and third selected |
| When | the Speaker dialog opened from the selection is applied with `co` |
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

## `ED-040` Translating the selected Segments again

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation, its first and third Segments selected |
| When | translating them again is chosen |
| Then | the Project is asked to translate Segments 0 and 2 again |
