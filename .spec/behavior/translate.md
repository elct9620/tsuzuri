# Translate

The Translate Mode: the Project's Transcript - from a transcription or an opened SRT file - is translated Segment by Segment through llama-server, the Resident llama-server or one started on a random port for the job and stopped when it ends, and the translations are written back into the Project.

## Includes

- `src-tauri/src/translation.rs`
- `src-tauri/src/translation/*.rs`
- `src-tauri/src/project/glossary.rs`
- `src/controllers/translate_controller.test.ts`
- `src/controllers/transcribe_controller.test.ts`
- `src/controllers/translation_settings_controller.test.ts`
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

## `TL-005` Translating the Current Resource

| Step | Statement |
| --- | --- |
| Given | the translate dialog and a Current Resource with an original subtitle |
| When | translating is started into `ja` |
| Then | the Current Resource is translated into `ja` |

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
| Given | a Current Resource being translated |
| When | the translation finishes |
| Then | a Notification lists each Phase with its seconds |

## `TL-010` Translating the Project as edited

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Project whose Segment text was edited |
| When | the Project is translated |
| Then | the edited text is translated and its translation is written into the Project |

## `TL-011` Translating only a Resource with an original subtitle

| Step | Statement |
| --- | --- |
| Given | a Current Resource of a media file alone |
| When | the toolbar shows it |
| Then | translating cannot be started |

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

## `TL-015` Naming the Primary Language in the translate dialog

| Step | Statement |
| --- | --- |
| Given | a Project in `ja` |
| When | the translate dialog opens |
| Then | it names Japanese as the Language translated from |

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

## `TL-024` Retrying a line the Model left out

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that leaves line 1 out of its first answer |
| When | a Transcript is translated |
| Then | line 1 is asked for again with a correction naming it, and every Segment carries its translation |

## `TL-025` Retrying a translation shared by different lines

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that first answers two different lines with the same translation |
| When | a Transcript is translated |
| Then | both lines are asked for again |

## `TL-026` Retrying a translation that kept the source text

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that first answers a line into English with Chinese left in it |
| When | a Transcript is translated into English |
| Then | the line is asked for again |

## `TL-027` Retrying a placeholder

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that first answers a line with `[inaudible]` |
| When | a Transcript is translated |
| Then | the line is asked for again |

## `TL-028` Keeping the original text of a line that cannot be repaired

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that always leaves line 1 out |
| When | a Transcript is translated |
| Then | line 1 carries its original text as its translation and the other lines their translations |

## `TL-029` Keeping the best imperfect translation

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that always drops the negation of a Chinese line |
| When | a Transcript is translated into English |
| Then | the line carries that translation rather than its original text |

## `TL-030` Splitting a Batch that keeps failing

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that leaves every line out of a request for more than two lines |
| When | a Batch of four is translated |
| Then | the lines are asked for again in halves of two, and every Segment carries its translation |

## `TL-031` Retrying an answer that is not JSON

| Step | Statement |
| --- | --- |
| Given | a ready llama-server whose first answer is not JSON |
| When | a Transcript is translated |
| Then | the Batch is asked for again and every Segment carries its translation |

## `TL-032` Showing the preceding lines when repairing

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that leaves line 1 out of its first answer |
| When | a Transcript is translated |
| Then | the request that repairs line 1 carries the original text of line 0 before it |

## `TL-033` Stopping when llama-server fails a request

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers a translation request with an HTTP error |
| When | a Transcript is translated |
| Then | the translation fails and no Segment carries its original text as a translation |

## `TL-034` Translating dialogue without its Speaker Label

| Step | Statement |
| --- | --- |
| Given | a ready llama-server, Speaker Labels turned on and a Segment `co: 你好` |
| When | it is translated |
| Then | the Model is sent `你好` and the translation starts with `co: ` |

## `TL-035` Leaving a clock time in the dialogue

| Step | Statement |
| --- | --- |
| Given | a ready llama-server, Speaker Labels turned on and a Segment `12:30 出發` |
| When | it is translated |
| Then | the Model is sent `12:30 出發` |

## `TL-036` Dropping Speaker Labels when the lines change

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers two labelled lines of one Segment as one line |
| When | it is translated with Speaker Labels turned on |
| Then | the translation carries no Speaker Label |

## `TL-037` Sending Speaker Labels only when turned on

| Step | Statement |
| --- | --- |
| Given | a ready llama-server, Speaker Labels turned off and a Segment `co: 你好` |
| When | it is translated |
| Then | the Model is sent `co: 你好` |

## `TL-038` Reading the Translation Glossary with the Project

| Step | Statement |
| --- | --- |
| Given | a directory whose `glossary.csv` has a `zh-TW,en` header and two rows |
| When | it is opened as the Project |
| Then | the Project holds `glossary.csv` and its two terms |

## `TL-039` Refusing to translate with a Translation Glossary without its header

| Step | Statement |
| --- | --- |
| Given | a Project whose `glossary.csv` has a header naming no Language, such as `名稱,譯名` |
| When | its Current Resource is translated |
| Then | the translation fails saying the header is missing |

## `TL-040` Sending only the terms a request uses

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Translation Glossary of `蝙蝠俠` and `阿福` |
| When | a Batch whose lines name only `蝙蝠俠` is translated |
| Then | the request carries `蝙蝠俠 => Batman` and not `阿福` |

## `TL-041` Retrying a translation that ignores the Translation Glossary

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that always translates `蝙蝠俠` as `Bat-Man` and a Translation Glossary giving `Batman` |
| When | a Transcript is translated |
| Then | the line is asked for again naming `Batman`, and keeps `Bat-Man` as its best imperfect translation |

## `TL-042` Showing the Project's Translation Glossary

| Step | Statement |
| --- | --- |
| Given | a Project whose `glossary.csv` holds twelve terms |
| When | the translate dialog opens |
| Then | it names `glossary.csv` with twelve terms |

## `TL-043` Reading the Translation Glossary again before translating

| Step | Statement |
| --- | --- |
| Given | a Project whose `glossary.csv` was written after it was opened |
| When | its Current Resource is translated |
| Then | the Project holds the terms of that `glossary.csv` |

## `TL-044` Carrying the Rolling Summary into the next Batch

| Step | Statement |
| --- | --- |
| Given | a ready llama-server, a Rolling Summary turned on and a Transcript of two Batches |
| When | it is translated |
| Then | the second Batch's request carries the summary the Model wrote after the first |

## `TL-045` Rewriting the Rolling Summary after each Batch

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Rolling Summary of at most 50 words turned on |
| When | a Batch has been translated |
| Then | the Model is asked for a summary under 50 words from the previous one and the Batch's lines with their translations |

## `TL-046` Keeping the Rolling Summary when a rewrite fails

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers the second summary request with malformed JSON |
| When | a Transcript of three Batches is translated with a Rolling Summary |
| Then | the third Batch's request carries the summary written after the first |

## `TL-047` Sending no summary requests when the Rolling Summary is off

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Rolling Summary turned off |
| When | a Transcript of two Batches is translated |
| Then | no request asks for a summary |

## `TL-048` Reviewing translations two lines at a time

| Step | Statement |
| --- | --- |
| Given | a ready llama-server, Self-Review turned on and a Batch of three lines |
| When | it is translated |
| Then | lines 0 and 1, then line 2, are reviewed, each with the source text of the lines beside it |

## `TL-049` Repairing a translation the review places on another line

| Step | Statement |
| --- | --- |
| Given | a ready llama-server whose first review places line 1's translation on line 2 |
| When | a Batch is translated with Self-Review |
| Then | line 1 is asked for again on its own |

## `TL-050` Keeping a translation the review keeps placing elsewhere

| Step | Statement |
| --- | --- |
| Given | a ready llama-server whose reviews always place line 1's translation on line 2 |
| When | a Batch is translated with Self-Review |
| Then | line 1 keeps its translation rather than its original text |

## `TL-051` Translating on when a review cannot be read

| Step | Statement |
| --- | --- |
| Given | a ready llama-server that answers every review with malformed JSON |
| When | a Batch is translated with Self-Review |
| Then | every line carries its translation |

## `TL-052` Sending no reviews when Self-Review is off

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and Self-Review turned off |
| When | a Batch is translated |
| Then | no request asks for a review |

## `TL-053` Remembering the translation settings

| Step | Statement |
| --- | --- |
| Given | translation settings of Batch size 4, 2 retries and 1 reference line |
| When | they are saved and loaded again |
| Then | they are Batch size 4, 2 retries and 1 reference line |

## `TL-054` Keeping each translation setting at least one

| Step | Statement |
| --- | --- |
| Given | translation settings of Batch size 0 and 0 retries |
| When | they are saved |
| Then | they are saved as Batch size 1 and 1 retry |

## `TL-055` Saving a translation setting from the settings panel

| Step | Statement |
| --- | --- |
| Given | the settings panel showing the saved translation settings |
| When | the Batch size is changed to 4 |
| Then | the translation settings are saved with Batch size 4 |

## `TL-056` Translating with the options the panel offers

| Step | Statement |
| --- | --- |
| Given | the translate dialog with Speaker Labels, Self-Review and a Rolling Summary of 80 words turned on |
| When | translating is started |
| Then | the Project is translated with those options |

## `TL-058` Showing each Batch as it is translated

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and a Project whose Current Resource is three Segments in Batches of two |
| When | it is translated |
| Then | a change is announced after each Batch, holding two translations and then three |

## `TL-059` Using the columns of the Languages translated between

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en,ja` with the row `蝙蝠俠,Batman,バットマン` |
| When | the terms for translating into `ja` are asked |
| Then | they are `蝙蝠俠` to `バットマン` |

## `TL-060` Leaving out a term the target Language has no word for

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en,ja` with the row `阿福,Alfred,` |
| When | the terms for translating into `ja` are asked |
| Then | there are none |

## `TL-061` Taking a `source,target` header as the Primary and translation Languages

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` last translated into `en` whose `glossary.csv` is `source,target` with the row `蝙蝠俠,Batman` |
| When | the terms for translating into `en` are asked |
| Then | they are `蝙蝠俠` to `Batman` |

## `TL-062` Refusing a `source,target` header without a translation Language

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` with no translation Language whose `glossary.csv` has a `source,target` header |
| When | its Translation Glossary is read |
| Then | it fails saying the header is missing |

## `TL-063` Reporting how many Segments are translated

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and three Segments in Batches of two |
| When | they are translated |
| Then | the translate progress carries two done of three, then three of three |

## `TL-064` Reporting how many windows are searched for Split Sentences

| Step | Statement |
| --- | --- |
| Given | a ready llama-server and three Segments searched in windows of two |
| When | the Split Sentences are searched for |
| Then | the detect progress carries how many windows are done of how many |

## `TL-065` Showing how many Segments are translated

| Step | Statement |
| --- | --- |
| Given | a Current Resource being translated |
| When | a translate progress event of 63% with 132 done of 210 arrives |
| Then | the editor shows the Phase, its percentage and 132 / 210 |

## `TL-066` Listing the Phases of a translation that follows a transcription

| Step | Statement |
| --- | --- |
| Given | a transcription that goes on to translate once it finishes |
| When | the translation starts |
| Then | the editor lists preparing the Components, loading the Model, searching for Split Sentences and translating instead |

## `TL-067` Starting the Resident llama-server without a Model

| Step | Statement |
| --- | --- |
| Given | a llama-server executable and a chosen translation Model |
| When | the Resident llama-server starts |
| Then | it runs in router mode with a preset naming the Model, loading no Model until asked |

## `TL-068` Loading the Model into the Resident llama-server

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server with no Model loaded |
| When | a translation asks for it |
| Then | the Model is loaded, and no Segment is sent before it reports the Model loaded |

## `TL-069` Refusing a Model the Resident llama-server fails to load

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server that reports the Model failed to load |
| When | a translation asks for it |
| Then | the translation fails without waiting for the load timeout |

## `TL-070` Freeing the Model once the kept seconds pass

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server with the Model loaded, to be kept for a second |
| When | the translation ends |
| Then | the Model is unloaded after that second, and the llama-server keeps running |

## `TL-071` Keeping the Model for a translation that starts in time

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server whose Model is kept for a while after a translation |
| When | another translation asks for it before then |
| Then | the Model is not unloaded under the new translation |

## `TL-072` Freeing the Model at once on request

The Model is freed when a transcription starts, so only one Model is loaded at a time.

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server with the Model kept loaded |
| When | the Model is asked to be freed |
| Then | it is unloaded before the request returns |

## `TL-073` Starting the Resident llama-server again after it exited

| Step | Statement |
| --- | --- |
| Given | a Resident llama-server whose process has exited |
| When | a translation asks for it |
| Then | a new one is started |

## `TL-074` Translating on a llama-server of its own with the Resident llama-server off

| Step | Statement |
| --- | --- |
| Given | the translation settings with the Resident llama-server turned off |
| When | a translation picks its llama-server |
| Then | it starts one for itself and stops it when it ends |

## `TL-075` Keeping the Model for the seconds the settings choose

| Step | Statement |
| --- | --- |
| Given | the translation settings with the Resident llama-server on and the Model kept for 30 seconds |
| When | a translation picks its llama-server |
| Then | it runs on the Resident llama-server and frees the Model 30 seconds after it ends |

## `TL-076` Stopping the Resident llama-server

| Step | Statement |
| --- | --- |
| Given | a running Resident llama-server |
| When | it is turned off in the settings |
| Then | its process is stopped |

## `TL-077` Turning the Resident llama-server off on the settings panel

| Step | Statement |
| --- | --- |
| Given | the settings panel with the Resident llama-server on |
| When | its toggle is turned off |
| Then | the setting is saved off and the kept seconds can no longer be changed |

