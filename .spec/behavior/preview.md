# Preview

Hearing and watching the Current Resource's media above the editor while its subtitles are corrected. The webview reads the media itself, so only the files of the open Project are handed to it.

## Includes

- `src-tauri/src/project/commands.rs`
- `src-tauri/src/waveform.rs`
- `src-tauri/src/waveform/*.rs`
- `src/controllers/preview_controller.test.ts`

## `PV-001` Letting the webview read a media file of the Project

| Step | Statement |
| --- | --- |
| Given | a directory with `ep01.mp4` |
| When | it is opened as the Project |
| Then | the webview may read `ep01.mp4` |

## `PV-002` Keeping the webview from files outside the Project

| Step | Statement |
| --- | --- |
| Given | a directory with `ep01.mp4` beside another directory with `ep02.mp4` |
| When | the first is opened as the Project |
| Then | the webview may not read `ep02.mp4` |

## `PV-003` Letting the webview read the directory of an opened SRT

| Step | Statement |
| --- | --- |
| Given | a directory with `ep01.mp4` and `ep01.srt` |
| When | `ep01.srt` is opened |
| Then | the webview may read `ep01.mp4` |

## `PV-004` Taking the Waveform of the Current Resource's media

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose media converts to 20 ms of audio, loud in its first 10 ms and silent after |
| When | its Waveform is extracted |
| Then | the answer holds the Peaks 1 and 0 |

## `PV-005` Refusing a Waveform without a media file

| Step | Statement |
| --- | --- |
| Given | a Current Resource of a subtitle alone |
| When | its Waveform is extracted |
| Then | it fails as having no media |

## `PV-006` Failing a Waveform ffmpeg cannot read

| Step | Statement |
| --- | --- |
| Given | ffmpeg failing to read the media file |
| When | its Waveform is extracted |
| Then | it fails with the last lines ffmpeg wrote |

## `PV-007` Leaving no audio behind after a Waveform

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file |
| When | its Waveform is extracted |
| Then | the converted audio is removed |

## `PV-008` Loading the Current Resource's media into the Preview

| Step | Statement |
| --- | --- |
| Given | a Current Resource with `/talks/ep01.mp4` |
| When | the Project is shown |
| Then | the player reads `/talks/ep01.mp4` through the asset protocol |

## `PV-009` Leaving the Preview out of a Resource without media

| Step | Statement |
| --- | --- |
| Given | a Current Resource of a subtitle alone |
| When | the Project is shown |
| Then | no player or controls are shown |

## `PV-010` Showing only the controls for media without a picture

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file |
| When | its media loads without a picture |
| Then | the controls are shown without the video |

## `PV-011` Telling the user a media file cannot be played

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file |
| When | the player fails to read it |
| Then | a hint that it cannot be previewed takes the video's place |

## `PV-012` Playing the whole media

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, paused |
| When | play is pressed |
| Then | the media plays from where it is |

## `PV-013` Stopping the media

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, playing |
| When | play is pressed |
| Then | the media pauses |

## `PV-014` Showing where the media is

| Step | Statement |
| --- | --- |
| Given | a Current Resource with media lasting 24 minutes 10 seconds |
| When | it plays to 1 minute 2 seconds |
| Then | the time reads `01:02 / 24:10` |

## `PV-015` Showing the Segment being played over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` from 0 to 1 s and `今天` from 1 to 2 s |
| When | it plays to 1.5 s |
| Then | `今天` is shown over the video |

## `PV-016` Showing nothing over the video between Segments

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `大家好` from 0 to 1 s |
| When | it plays to 1.5 s |
| Then | nothing is shown over the video |
