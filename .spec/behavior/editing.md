# Editing

Correcting the Project in the transcript panel, where every edit is written to Rust, and exporting it as SRT - the original text, or the translation or a Bilingual SRT when there is one.

## Includes

- `src/controllers/transcript_controller.test.ts`
- `src/controllers/project_controller.test.ts`
- `src/controllers/segment_changes_controller.test.ts`

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

## `ED-009` Showing a Placeholder for each translation still to come

| Step | Statement |
| --- | --- |
| Given | a Current Resource being translated whose second Segment has no translation yet |
| When | the editor shows it |
| Then | the second Segment's translation is a Placeholder |

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

## `ED-012` Naming the Speaker of a Segment

| Step | Statement |
| --- | --- |
| Given | a Project in the panel |
| When | the first Segment's Speaker is set to `co` |
| Then | the edit is written to the Project as its Speaker |

## `ED-013` Offering the Speakers already named

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose Segments are said by `co` and `cl`, in a Project whose Translation Glossary names the Speaker `小明` |
| When | the editor shows it |
| Then | each Segment's Speaker offers `cl`, `co` and `小明` to choose from |

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
