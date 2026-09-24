# Transcribe

The Transcribe Mode: a video or audio file becomes a Transcript by two Steps, ffmpeg converting it to 16 kHz mono WAV and whisper-cli transcribing that WAV, each starting only after the previous process exited.

## Includes

- `src-tauri/src/pipeline.rs`
- `src/controllers/transcribe_controller.test.ts`
- `src/controllers/transcript_controller.test.ts`
- `src/controllers/tabs_controller.test.ts`

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
| Given | a media file being transcribed |
| When | a progress event arrives |
| Then | the transcribe panel shows the Phase and its percentage |

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
| Given | a media file being transcribed |
| When | a load progress event without a percentage arrives |
| Then | the transcribe panel shows a progress bar with no value |

## `TX-011` Showing how long each Phase took

| Step | Statement |
| --- | --- |
| Given | a media file being transcribed |
| When | the transcription finishes |
| Then | the transcribe panel lists each Phase with its seconds |

## `TX-012` Translating once transcribed

| Step | Statement |
| --- | --- |
| Given | the transcribe panel with translating afterwards chosen |
| When | a media file is transcribed |
| Then | the Project is translated into the selected language, making it the Transcribe and Translate Mode |

## `TX-013` Ending a transcription on the Edit tab

| Step | Statement |
| --- | --- |
| Given | the transcribe panel |
| When | a transcription, and the translation after it when chosen, succeeds |
| Then | the Edit tab is shown |

## `TX-014` Staying on a failed transcription

| Step | Statement |
| --- | --- |
| Given | the transcribe panel |
| When | a transcription fails |
| Then | the transcribe panel stays shown with the reason |

## `TX-015` Transcribing in the chosen Language

| Step | Statement |
| --- | --- |
| Given | a media file and the transcription Language `ja` |
| When | it is transcribed |
| Then | whisper-cli is asked for Japanese and the Project's Transcript is in `ja` |

## `TX-016` Transcribing in the selected Language

| Step | Statement |
| --- | --- |
| Given | the Transcribe Mode panel with a Language selected |
| When | a media file is transcribed |
| Then | it is transcribed in the selected Language |
