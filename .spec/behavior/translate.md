# Translate

The Translate Mode: the Project's Transcript - from a transcription or an opened SRT file - is translated Segment by Segment through llama-server, which is started on a random port for the job and stopped when it ends, and the translations are written back into the Project.

## Includes

- `src-tauri/src/translation.rs`
- `src/controllers/translate_controller.test.ts`
- `src/controllers/transcribe_controller.test.ts`
- `src/controllers/transcript_controller.test.ts`
- `src/controllers/tabs_controller.test.ts`

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
| Then | the result holds the load, detect and translate Phases with their seconds, in that order |

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

## `TL-012` Ending a translation on the Edit tab

| Step | Statement |
| --- | --- |
| Given | the Translate Mode panel and a Project |
| When | a translation succeeds |
| Then | the Edit tab is shown |

## `TL-013` Naming the target Language to the Model

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and the target Language `ja` |
| When | a Transcript is translated |
| Then | the Model is asked for Japanese |

## `TL-014` Naming the source Language to the Model

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and the source Language `ja` |
| When | a Transcript is translated |
| Then | the Model is asked to translate from Japanese |

## `TL-015` Translating from the Project's Language

| Step | Statement |
| --- | --- |
| Given | the Translate Mode panel and a Project in `ja` |
| When | translating is started |
| Then | the Project is translated from `ja` |

## `TL-016` Translating from the Language just transcribed

| Step | Statement |
| --- | --- |
| Given | the Transcribe Mode panel set to translate once transcribed |
| When | a media file is transcribed in `en` |
| Then | the Project is translated from `en` |

## `TL-017` Translating in Batches

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Transcript of three Segments |
| When | it is translated in Batches of two |
| Then | two requests are sent, carrying two Segments and then one |

## `TL-018` Matching translations by index

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers a Batch's translations in reverse order |
| When | a Transcript is translated |
| Then | each Segment carries the translation answered for its index |

## `TL-019` Carrying the previous Batch as reference

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Transcript of two Batches |
| When | it is translated |
| Then | the second request carries the last lines of the first with their translations |

## `TL-020` Keeping a Split Sentence in one Batch

| Step | Statement |
| --- | --- |
| Given | a Transcript of three Segments whose last two the Model reports as one sentence |
| When | it is translated in Batches of two |
| Then | the Batches carry the first Segment, then the last two |

## `TL-021` Batching an overlong Split Sentence as usual

| Step | Statement |
| --- | --- |
| Given | a Transcript of five Segments the Model reports as one sentence |
| When | it is translated in Batches of two |
| Then | the Batches carry two, two and one Segments |

## `TL-022` Looking for Split Sentences in overlapping windows

| Step | Statement |
| --- | --- |
| Given | a Transcript of five Segments |
| When | Split Sentences are looked for in windows of four |
| Then | the Model is shown the first four Segments, then the last three |

## `TL-023` Translating on when a window cannot be read

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers the search for Split Sentences with malformed JSON |
| When | a Transcript is translated |
| Then | every Segment still carries its translation |
