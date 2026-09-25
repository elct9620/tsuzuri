# Preview

Hearing and watching the Current Resource's media above the editor while its subtitles are corrected. The webview reads the media itself, so only the files of the open Project are handed to it.

## Includes

- `src-tauri/src/project/commands.rs`

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
