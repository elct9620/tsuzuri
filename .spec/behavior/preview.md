# Preview

Hearing and watching the Current Resource's media above the editor while its subtitles are corrected. The webview reads the media itself, so only the files of the open Project are handed to it.

## Includes

- `src-tauri/src/project/commands.rs`
- `src-tauri/src/waveform.rs`
- `src-tauri/src/waveform/*.rs`

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
