# Transcribe

The Transcribe Mode: a video or audio file becomes a Transcript by two Steps, ffmpeg converting it to 16 kHz mono WAV and whisper-cli transcribing that WAV, each starting only after the previous process exited.

## Includes

- `src-tauri/src/transcription.rs`
- `src-tauri/src/transcription/*.rs`
- `src/components/TranscriptionDialog.test.ts`
- `src/components/TaskProgress.test.ts`
- `src/controllers/transcript-controller.test.ts`
- `src/components/settings/general/Transcription.test.ts`
- `src/controllers/project-controller.test.ts`
- `src/components/settings/project/Transcription.test.ts`

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

## `TX-030` Warning once of all a transcription overwrites

Translating afterwards shares the translate dialog's options, yet the dialog warns once, below them, of everything starting overwrites.

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog for a Current Resource with an original subtitle and translated into `en` |
| When | translating afterwards into `en` is chosen |
| Then | one warning says the subtitle and the translation will be overwritten, and its start button reads 覆蓋並開始 |

## `TX-031` Warning only of a translation it will make

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog for a Current Resource translated into `en` alone, translating afterwards into `en` |
| When | translating afterwards is no longer chosen |
| Then | no overwrite is warned of, and its start button reads 開始轉錄 |

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

## `TX-027` Listing the Phases a transcription goes through

The whole run is laid out ahead, so how far along it is reads at a glance.

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | a load progress event arrives |
| Then | the editor lists preparing the Components, converting, loading the Model and transcribing, the first two marked done and loading the Model marked as the one running |

## `TX-028` Summing up the running Phase in the editor's heading

| Step | Statement |
| --- | --- |
| Given | a Current Resource being transcribed |
| When | a transcribe progress event of 23% arrives |
| Then | the heading's progress button reads the Phase and 23% |

## `TX-029` Cancelling a transcription

| Step | Statement |
| --- | --- |
| Given | the progress of a transcription running |
| When | cancelling is chosen |
| Then | the Project is asked to cancel the running task, and once it stops a Notification says it was cancelled |

## `TX-032` Leaving whisper-cli as it behaves on its own

The default Transcription Settings change nothing, so a Model that transcribes well today keeps doing so.

| Step | Statement |
| --- | --- |
| Given | the default Transcription Settings |
| When | a media file is transcribed |
| Then | whisper-cli is asked for neither VAD, suppressing non-speech tokens, nor a limit on its text context |

## `TX-033` Transcribing with VAD

| Step | Statement |
| --- | --- |
| Given | Transcription Settings with VAD on and a Model chosen for the VAD slot |
| When | a media file is transcribed |
| Then | whisper-cli is asked for VAD with that Model |

## `TX-034` Refusing VAD without its Model

| Step | Statement |
| --- | --- |
| Given | Transcription Settings with VAD on and no Model chosen for the VAD slot |
| When | a media file is transcribed |
| Then | it is refused as the VAD Model not chosen, before any process starts |

## `TX-035` Suppressing non-speech tokens and carrying no context

| Step | Statement |
| --- | --- |
| Given | Transcription Settings suppressing non-speech tokens and carrying no context |
| When | a media file is transcribed |
| Then | whisper-cli is asked to suppress non-speech tokens and to keep no text context |

## `TX-036` Taking the Project's Transcription Settings over the general ones

| Step | Statement |
| --- | --- |
| Given | general Transcription Settings with VAD off, and a Project that sets VAD on for itself |
| When | its Current Resource is transcribed |
| Then | whisper-cli is asked for VAD |

## `TX-037` Transcribing with the Project Model

| Step | Statement |
| --- | --- |
| Given | a Project whose Project Model for the transcription slot differs from the general one |
| When | its Current Resource is transcribed |
| Then | whisper-cli loads the Project Model |

## `TX-038` Remembering the Transcription Settings

| Step | Statement |
| --- | --- |
| Given | Transcription Settings saved with VAD on |
| When | they are loaded again from the same app data |
| Then | VAD is on |

## `TX-039` Changing a Transcription Setting in the general settings

| Step | Statement |
| --- | --- |
| Given | the general settings with VAD off |
| When | VAD is turned on |
| Then | the Transcription Settings are saved with VAD on and the rest as they were |

## `TX-040` Setting a Transcription Setting for the Project

| Step | Statement |
| --- | --- |
| Given | the settings of a Project following the general Transcription Settings |
| When | VAD is chosen on for the Project |
| Then | the Project Options are set with VAD on and the rest following the general settings |

## `TX-041` Naming the Project Model in the transcribe dialog

| Step | Statement |
| --- | --- |
| Given | a Project with a Project Model for the transcription slot |
| When | the transcribe dialog is opened |
| Then | it names the Project Model's file |

## `TX-042` Transcribing from a Segment onward

What comes before the chosen Segment is what the user already put right, so it stays as it is.

| Step | Statement |
| --- | --- |
| Given | a Current Resource of `ep01.mp4` and `ep01.srt` with Segments starting at 0, 5 and 10 s |
| When | it is transcribed from the second Segment onward |
| Then | the first Segment is kept and whisper-cli's Segments, moved 5 s later, take the place of the other two |

## `TX-043` Transcribing a span of Segments

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments starting at 0, 5, 10 and 15 s |
| When | it is transcribed from the second through the third |
| Then | the first and the last are kept and whisper-cli's Segments, moved 5 s later, lie between them |

## `TX-044` Converting only the Audio Window

whisper-cli's own offset and duration neither stop at the duration nor keep their times once VAD runs, so ffmpeg cuts the audio instead.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 5 to 9 s and from 10 to 14 s |
| When | it is transcribed from the first through the second |
| Then | ffmpeg is asked for 9 s of audio from 5 s, and whisper-cli for no offset |

## `TX-045` Showing the kept Segments while transcribing a span

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments starting at 0, 5 and 10 s, transcribed from the second through the second |
| When | whisper-cli prints one Segment and has not exited |
| Then | the Project shows the first Segment, the printed one moved 5 s later, and the last, in that order |

## `TX-046` Answering the Segments a span wrote

Translating afterwards covers what the transcription wrote and nothing around it.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments starting at 0, 5 and 10 s, and whisper-cli writing two Segments |
| When | it is transcribed from the second Segment onward |
| Then | the answer's written span runs from the second position through the third |

## `TX-047` Refusing a Segment the Current Resource does not have

| Step | Statement |
| --- | --- |
| Given | a Current Resource of three Segments |
| When | it is transcribed from the fifth Segment onward |
| Then | it is refused before any Step runs |

## `TX-048` Transcribing again from a Segment's menu

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and three Segments |
| When | transcribing again from the second Segment is chosen from its menu and started from the dialog |
| Then | the Project is asked to transcribe from Segment 1 onward, over its subtitle |

## `TX-049` Transcribing the Checked Segments again

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, its first and third Segments checked |
| When | transcribing them again is chosen and started from the dialog |
| Then | the Project is asked to transcribe the span from Segment 0 through 2 |

## `TX-050` Translating afterwards only what a transcription from a Segment wrote

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation, transcribed again from a Segment with translating afterwards chosen |
| When | the transcription answers it wrote Segments 1 through 2 |
| Then | the Project is asked to translate Segments 1 and 2 again |

## `TX-051` Offering to transcribe again only with a media file

| Step | Statement |
| --- | --- |
| Given | a Current Resource of an SRT file alone, its first Segment checked |
| When | the editor shows it |
| Then | neither the Segment menu nor the bar for Checked Segments offers transcribing again |

## `TX-052` Offering to translate afterwards only into the translation shown

A transcription from a Segment writes only part of the subtitle, so what follows it translates only that part, into the translation already there.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file showing no translation |
| When | the dialog to transcribe again from a Segment opens |
| Then | translating afterwards is not offered |

## `TX-053` Saying the transcription settings were not read

| Step | Statement |
| --- | --- |
| Given | the Settings page opening |
| When | reading the transcription settings fails |
| Then | a Notification says the settings were not read |

## `TX-054` Saying the transcription settings were not saved

| Step | Statement |
| --- | --- |
| Given | the transcription settings on the Settings page |
| When | saving a change is refused |
| Then | a Notification says the settings were not saved |

## `TX-055` Leaving out the real-time factor of no audio

| Step | Statement |
| --- | --- |
| Given | an Audio Window that starts past the end of the media |
| When | its transcription finishes with no audio |
| Then | the Notification lists no real-time factor |

## `TX-056` Leaving no intermediate files once a transcription ends

The converted audio and whisper-cli's own SRT sit in a directory of the transcription's own, removed however it ends.

| Step | Statement |
| --- | --- |
| Given | a media file transcribed into a directory of its own |
| When | the transcription ends, finished or failed |
| Then | the directory is gone |

## `TX-057` Cleaning Simplified Chinese out of a transcription in `zh-TW`

A speech recognition Model writing Traditional Chinese still leaves Simplified characters behind, so a Simplified Cleanup follows it by default.

| Step | Statement |
| --- | --- |
| Given | Transcription Settings with the cleanup on, a Project in `zh-TW`, and whisper-cli writing `这是测试` |
| When | the Current Resource is transcribed |
| Then | the Segment is shown as `這是測試` as whisper-cli writes it, and the subtitle reads `這是測試` |

## `TX-058` Leaving a transcription as whisper-cli wrote it with the cleanup off

| Step | Statement |
| --- | --- |
| Given | Transcription Settings with the cleanup off, a Project in `zh-TW`, and whisper-cli writing `这是测试` |
| When | the Current Resource is transcribed |
| Then | the subtitle reads `这是测试` |

## `TX-059` Showing no translation once the whole media file is transcribed again

A new transcription writes new Segments the translations no longer line up with, so the one shown stops being shown.

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation |
| When | its whole media file is transcribed again |
| Then | no translation is shown |

## `TX-060` Keeping the translation shown through a transcription within an Audio Window

A transcription within an Audio Window writes only that window's Segments, so the translation shown stays shown.

| Step | Statement |
| --- | --- |
| Given | a Current Resource showing its `en` translation |
| When | a span of its Segments is transcribed again |
| Then | the `en` translation is still shown |

## `TX-061` Listing the real-time factor

| Step | Statement |
| --- | --- |
| Given | a transcription of 60 seconds of audio that took 30 seconds |
| When | it finishes |
| Then | the Notification lists a real-time factor of 0.50 |

## `TX-062` Starting no transcription while another task runs

One task runs at a time, so a transcription asked for while one runs leaves the running task as it is.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, while a diarization runs |
| When | its transcription is started from the toolbar |
| Then | no transcription is asked for |

## `TX-063` Keeping the translation options through unchecking translating afterwards

The dialog holds the translation options until it opens again, so hiding them loses nothing chosen.

| Step | Statement |
| --- | --- |
| Given | the transcribe dialog translating afterwards with self-review chosen |
| When | translating afterwards is unchecked and checked again before starting |
| Then | the translation asked for still has self-review |
