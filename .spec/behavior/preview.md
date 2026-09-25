# Preview

Hearing and watching the Current Resource's media above the editor while its subtitles are corrected. The webview reads the media itself, so only the files of the open Project are handed to it.

## Includes

- `src-tauri/src/project/commands.rs`
- `src-tauri/src/waveform.rs`
- `src-tauri/src/waveform/*.rs`
- `src/controllers/preview_controller.test.ts`
- `src/controllers/timeline_controller.test.ts`
- `src/controllers/current_segment.test.ts`

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

## `PV-017` Drawing the Waveform of the Current Resource's media

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file whose Waveform holds 200 Peaks at 100 a second |
| When | the Project is shown |
| Then | the timeline draws those Peaks over 2 seconds |

## `PV-018` Dropping a Waveform of media no longer current

| Step | Statement |
| --- | --- |
| Given | a Current Resource with `ep02.mp4` |
| When | a Waveform taken from `ep01.mp4` arrives |
| Then | the timeline does not draw it |

## `PV-019` Marking each Segment on the timeline

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and three Segments |
| When | the Project is shown |
| Then | each Segment is a region spanning its own times |

## `PV-020` Following edited Segments on the timeline without losing the zoom

| Step | Statement |
| --- | --- |
| Given | a timeline zoomed in on a Current Resource with two Segments |
| When | a third Segment is added |
| Then | the timeline marks three Segments at the same zoom |

## `PV-021` Zooming the timeline in

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | zoom in is pressed |
| Then | the timeline shows 200 pixels a second |

## `PV-022` Zooming the timeline out

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | zoom out is pressed |
| Then | the timeline shows 50 pixels a second |

## `PV-023` Scrolling the timeline with the wheel

| Step | Statement |
| --- | --- |
| Given | a timeline scrolled to its start |
| When | the wheel turns down by 120 |
| Then | the timeline scrolls 120 pixels later |

## `PV-024` Telling neighbouring Segments apart on the timeline

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and three Segments |
| When | the Project is shown |
| Then | the first and third regions share one colour and the second has another |

## `PV-025` Making a Segment current from the editor

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the second Segment's row is clicked |
| Then | that row alone is marked as the Current Segment |

## `PV-026` Making a Segment current from the timeline

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the second Segment's region is clicked |
| Then | that Segment's row alone is marked as the Current Segment |

## `PV-027` Showing the Current Segment on the timeline

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the second Segment's row is clicked |
| Then | its region is coloured more strongly than the other |

## `PV-028` Playing the Current Segment with Space

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource whose Current Segment runs from 1 to 2 s |
| When | Space is pressed outside a field or button |
| Then | the media plays from 1 s |

## `PV-029` Stopping at the end of the Current Segment

| Step | Statement |
| --- | --- |
| Given | the Current Segment from 1 to 2 s playing after Space |
| When | the media reaches 2 s |
| Then | the media pauses |

## `PV-030` Stopping the media with Space

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose media is playing |
| When | Space is pressed outside a field or button |
| Then | the media pauses |

## `PV-031` Leaving Space to the field being typed in

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource with a Current Segment |
| When | Space is pressed in a Segment's text field |
| Then | the media stays paused |

## `PV-032` Marking the Segment being played in the editor

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s |
| When | the media plays to 1.5 s |
| Then | the second Segment's row alone is marked as playing |

## `PV-033` Zooming the timeline with Ctrl and the wheel

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | the wheel turns up with Ctrl held, as far as zooming by two takes |
| Then | the timeline shows 200 pixels a second |

## `PV-034` Folding the Preview away

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, its Preview shown |
| When | the Preview's fold button is pressed |
| Then | the Preview is hidden and the Segment list keeps the room |

## `PV-035` Keeping the Preview folded for the next Resource

| Step | Statement |
| --- | --- |
| Given | the Preview folded away |
| When | another Resource with a media file becomes current |
| Then | its Preview stays folded |
