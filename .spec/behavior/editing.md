# Editing

Correcting a Transcript in the transcript panel and saving it as SRT - the original text, or the translation or a Bilingual SRT when there is one.

## Includes

- `src/controllers/transcript_controller.test.ts`

## `ED-001` Saving an edited Segment

| Step | Statement |
| --- | --- |
| Given | a Transcript in the panel whose Segment text was edited |
| When | the original is saved as SRT |
| Then | the Segment is saved as the original with the edited text |

## `ED-002` Saving the translation

| Step | Statement |
| --- | --- |
| Given | a translated Transcript in the panel whose translation was edited |
| When | the translation is saved as SRT |
| Then | the Segment is saved as the translation with the edited translation |

## `ED-003` Saving a Bilingual SRT

| Step | Statement |
| --- | --- |
| Given | a translated Transcript in the panel |
| When | it is saved as a Bilingual SRT |
| Then | the Segments are saved as bilingual with both their text and translation |
