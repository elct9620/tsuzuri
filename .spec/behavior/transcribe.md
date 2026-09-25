# Transcribe

The Transcribe Mode: a video or audio file becomes a Transcript by two Steps, ffmpeg converting it to 16 kHz mono WAV and whisper-cli transcribing that WAV, each starting only after the previous process exited.

## Includes

- `src-tauri/src/transcription.rs`
- `src-tauri/src/transcription/*.rs`
- `src/controllers/transcribe_controller.test.ts`
- `src/controllers/transcript_controller.test.ts`

## `TX-001` Transcribing a media file

| Step | Statement |
| --- | --- |
| Given | a media file, ready Components and a chosen transcription Model |
| When | it is transcribed |
| Then | the result holds the Segments of the SRT whisper-cli wrote |

## `TX-002` Reporting transcription progress

| Step | Statement |
| --- | --- |
| Given | whisper-cli reporting its progress while it runs |
| When | a media file is transcribed |
| Then | a progress event carries each percentage it reported |

## `TX-003` Stopping at a failed conversion

| Step | Statement |
| --- | --- |
| Given | ffmpeg failing to read the media file |
| When | it is transcribed |
| Then | it fails naming the convert Step and whisper-cli never starts |

## `TX-004` Refusing without a transcription Model

| Step | Statement |
| --- | --- |
| Given | no transcription Model chosen |
| When | a media file is transcribed |
| Then | it is refused before any process starts |

## `TX-005` Measuring the real-time factor

| Step | Statement |
| --- | --- |
| Given | a media file whose converted WAV lasts two seconds |
| When | it is transcribed |
| Then | the result reports two seconds of audio beside the transcription time |

## `TX-006` Showing the Transcript

| Step | Statement |
| --- | --- |
| Given | a Project of two Segments |
| When | the transcript panel shows it |
| Then | the panel lists both Segments with their start and end times |

## `TX-007` Showing progress while transcribing

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | a progress event arrives |
| Then | the editor shows the Phase and its percentage |

## `TX-008` Telling the Model load apart from transcribing

| Step | Statement |
| --- | --- |
| Given | whisper-cli loading its Model before it starts processing the WAV |
| When | a media file is transcribed |
| Then | a load progress event without a percentage arrives before the first transcription percentage |

## `TX-009` Answering how long each Phase took

| Step | Statement |
| --- | --- |
| Given | a media file, ready Components and a chosen transcription Model |
| When | it is transcribed |
| Then | the result holds the prepare, convert, load and transcribe Phases with their seconds, in that order |

## `TX-010` Showing a Phase that has no percentage

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | a load progress event without a percentage arrives |
| Then | the editor shows a progress bar with no value |

## `TX-011` Showing how long each Phase took

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | the transcription finishes |
| Then | a Notification lists each Phase with its seconds |

## `TX-012` Translating once transcribed

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog with translating afterwards into `ja` chosen |
| When | transcribing is started |
| Then | the Current Resource is translated into `ja` once transcribed |

## `TX-023` Translating once transcribed with the dialog's options

Transcribing leads into translating, so the transcribe dialog offers the same translation options as the translate dialog.

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog with translating afterwards and Self-Review chosen |
| When | transcribing is started |
| Then | the Current Resource is translated with Self-Review once transcribed |

## `TX-024` Showing the translation options only when translating afterwards

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog |
| When | translating afterwards is chosen |
| Then | the translation options are shown |

## `TX-014` Saying why a transcription failed

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | the transcription fails |
| Then | a Notification shows the reason |

## `TX-015` Transcribing in the Primary Language

| Step | Statement |
| --- | --- |
| Given | a Project in `ja` whose Current Resource has a media file |
| When | it is transcribed |
| Then | whisper-cli is asked for Japanese |

## `TX-017` Showing each Segment as whisper-cli prints it

| Step | Statement |
| --- | --- |
| Given | whisper-cli that prints one Segment and has not exited |
| When | the Current Resource is being transcribed |
| Then | the Project holds that Segment |

## `TX-018` Writing the transcription beside its media file

| Step | Statement |
| --- | --- |
| Given | a Current Resource of `ep01.mp4` alone |
| When | it is transcribed |
| Then | `ep01.srt` holds the Segments of the SRT whisper-cli wrote |

## `TX-019` Refusing to overwrite a subtitle unless asked

| Step | Statement |
| --- | --- |
| Given | a Current Resource of `ep01.mp4` and `ep01.srt` |
| When | it is transcribed without asking to overwrite |
| Then | the transcription fails saying `ep01.srt` exists, before any Step runs |

## `TX-020` Overwriting a subtitle when asked

| Step | Statement |
| --- | --- |
| Given | a Current Resource of `ep01.mp4` and `ep01.srt` |
| When | it is transcribed asking to overwrite |
| Then | `ep01.srt` holds the Segments of the SRT whisper-cli wrote |

## `TX-021` Transcribing only a Resource with a media file

| Step | Statement |
| --- | --- |
| Given | a Current Resource of an SRT file alone |
| When | the toolbar shows it |
| Then | transcribing cannot be started |

## `TX-022` Asking before overwriting a subtitle

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and an original subtitle |
| When | the transcribe dialog is started |
| Then | it warns the subtitle will be overwritten and transcribes asking to overwrite |

## `TX-025` Clearing the progress once a transcription ends

The progress belongs to a running task, so what is left to say afterwards goes to a Notification.

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | the transcription finishes |
| Then | the editor shows no progress |

## `TX-026` Telling a transcription and its translation apart

| Step | Statement |
| --- | --- |
| Given | a Current Resource transcribed with translating afterwards chosen |
| When | the transcription and then the translation finish |
| Then | one Notification says the transcription finished and another says the translation finished |
