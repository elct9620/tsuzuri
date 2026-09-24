# Transcribe

The Transcribe Mode: a video or audio file becomes a Transcript by two Steps, ffmpeg converting it to 16 kHz mono WAV and whisper-cli transcribing that WAV, each starting only after the previous process exited.

## Includes

- `src-tauri/src/pipeline.rs`
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
| Given | a Transcript of two Segments |
| When | it is loaded into the transcript panel |
| Then | the panel lists both Segments with their start and end times |

## `TX-007` Showing progress while transcribing

| Step | Statement |
| --- | --- |
| Given | a media file being transcribed |
| When | a progress event arrives |
| Then | the transcribe panel shows the Step and its percentage |
