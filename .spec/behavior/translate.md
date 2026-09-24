# Translate

The Translate Mode: a Transcript - read from an existing SRT, or just produced by Transcribe - is translated Segment by Segment through llama-server, which is started on a random port for the job and stopped when it ends.

## Includes

- `src-tauri/src/translation.rs`
- `src/controllers/translate_controller.test.ts`
- `src/controllers/transcript_controller.test.ts`

## `TL-001` Translating each Segment

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Transcript of two Segments |
| When | the Transcript is translated |
| Then | each Segment keeps its times and carries its translation |

## `TL-002` Waiting for the Model to load

| Step | Statement |
| --- | --- |
| Given | a llama-server still loading its Model |
| When | the Transcript is translated |
| Then | no Segment is sent before `/health` answers ready |

## `TL-003` Refusing without a translation Model

| Step | Statement |
| --- | --- |
| Given | no translation Model chosen |
| When | a Transcript is translated |
| Then | it is refused before llama-server starts |

## `TL-004` Stopping llama-server when translation ends

| Step | Statement |
| --- | --- |
| Given | a llama-server that never answers ready |
| When | translation gives up waiting |
| Then | the llama-server process is no longer running |

## `TL-005` Translating the Project

| Step | Statement |
| --- | --- |
| Given | the Translate Mode panel and a Project |
| When | translating is started |
| Then | the Project is translated into the selected language |

## `TL-006` Showing a translation beside its Segment

| Step | Statement |
| --- | --- |
| Given | a translated Project |
| When | the transcript panel shows it |
| Then | each Segment shows its translation under its text |

## `TL-007` Answering how long each Phase took

| Step | Statement |
| --- | --- |
| Given | a started llama-server that loads its Model and a Transcript of two Segments |
| When | the Transcript is translated |
| Then | the result holds the load and translate Phases with their seconds, in that order |

## `TL-008` Showing how long each Phase took

| Step | Statement |
| --- | --- |
| Given | an SRT file being translated |
| When | the translation finishes |
| Then | the translate panel lists each Phase with its seconds |

## `TL-010` Translating the Project as edited

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Project whose Segment text was edited |
| When | the Project is translated |
| Then | the edited text is translated and its translation is written into the Project |

## `TL-011` Waiting for a Project before translating

| Step | Statement |
| --- | --- |
| Given | the Translate Mode panel and no Project |
| When | the panel is shown |
| Then | translating cannot be started until a Project is made |
