# Editing

Correcting a Transcript in the transcript panel and saving it as SRT - the original text, or the translation when there is one.

## Includes

- `src/controllers/transcript_controller.test.ts`

## `ED-001` Saving an edited Segment

| Step | Statement |
| --- | --- |
| Given | a Transcript in the panel whose Segment text was edited |
| When | the original is saved as SRT |
| Then | the saved Segment carries the edited text |

## `ED-002` Saving the translation

| Step | Statement |
| --- | --- |
| Given | a translated Transcript in the panel |
| When | the translation is saved as SRT |
| Then | the saved Segments carry the translations in place of the original text |
