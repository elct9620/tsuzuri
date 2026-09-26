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
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing |
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

## `PV-036` Showing the Current Segment beside the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the second Segment's row is clicked |
| Then | the card beside the video shows #2 with its times, text and translation |

## `PV-037` Following an edit of the Current Segment beside the video

| Step | Statement |
| --- | --- |
| Given | the second Segment current, reading `今天` |
| When | its text is changed to `明天` |
| Then | the card beside the video shows `明天` |

## `PV-038` Clearing the playing mark when the media stops

| Step | Statement |
| --- | --- |
| Given | the second Segment's row marked as playing |
| When | the media pauses |
| Then | no row is marked as playing |

## `PV-039` Leaving the next row unmarked when a Segment played alone ends

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource with Segments from 0 to 1 s and from 1 to 2 s |
| When | the media is moved to 1 s, the end of the first |
| Then | no row is marked as playing |

## `PV-040` Zooming the timeline with Alt and the wheel

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | the wheel turns up with Alt held, as far as zooming by two takes |
| Then | the timeline shows 200 pixels a second |

## `PV-041` Showing how far the timeline is zoomed

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second, shown as 100% |
| When | zoom in is pressed |
| Then | the zoom level reads 200% |

## `PV-042` Taking the timeline back to where it started

| Step | Statement |
| --- | --- |
| Given | a timeline zoomed in to 200% |
| When | the zoom level is pressed |
| Then | the timeline shows 100 pixels a second again |

## `PV-043` Showing the translation shown over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s, translated `Today` in the translation shown |
| When | the translation is chosen over the video and the media plays to 0.5 s |
| Then | `Today` is shown over the video |

## `PV-044` Showing both languages over the video in the Bilingual Order

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s, translated `Today` in the translation shown, its Bilingual Order putting the original first |
| When | both languages are chosen over the video and the media plays to 0.5 s |
| Then | `今天` is shown over the video above `Today` |

## `PV-045` Putting the translation first over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s, translated `Today` in the translation shown, its Bilingual Order putting the translation first |
| When | both languages are chosen over the video and the media plays to 0.5 s |
| Then | `Today` is shown over the video above `今天` |

## `PV-046` Showing the original over the video with no translation shown

| Step | Statement |
| --- | --- |
| Given | both languages chosen over the video, and a Current Resource with the Segment `今天` from 0 to 1 s and no translation shown |
| When | the media plays to 0.5 s |
| Then | `今天` alone is shown over the video |

## `PV-047` Offering only the original over the video with no translation shown

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and no translation shown |
| When | the Project is shown |
| Then | only the original can be chosen over the video |

## `PV-048` Keeping what is shown over the video for the next Resource

| Step | Statement |
| --- | --- |
| Given | both languages chosen over the video |
| When | another Resource with a media file and a translation shown becomes current |
| Then | both languages stay chosen |

## `PV-049` Leaving out the choice over the video for media without a picture

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file |
| When | its media loads without a picture |
| Then | no choice of what is shown over the video is offered |
## `PV-068` Showing what is over the video on a translucent black by default

A caption drawn with a shadow alone is lost on a bright picture, so it sits on a backdrop unless the user takes it away.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file, and no backdrop ever chosen on this machine |
| When | the Project is shown |
| Then | what is shown over the video sits on a translucent black |

## `PV-069` Choosing the backdrop of what is over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file |
| When | an opaque black is chosen as the backdrop over the video |
| Then | what is shown over the video sits on an opaque black |

## `PV-070` Keeping the backdrop over the video for the next Resource

| Step | Statement |
| --- | --- |
| Given | the backdrop over the video taken away |
| When | another Resource with a media file becomes current |
| Then | what is shown over the video still has no backdrop |

### Retiming on the timeline

Subtitle editors retime a cue on its waveform: an edge or the whole cue is dragged and written once let go, snapping to what is near unless Shift is held. Only the Current Segment moves, so a click on a narrow region still selects it, and no Segment is dragged over another, since a translation is matched to its original by time.

## `PV-050` Dragging the Current Segment's end on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s |
| When | its end is dragged 20 pixels later |
| Then | the Project is asked to change its times to 0 to 0.7 s |

## `PV-051` Moving the Current Segment on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0.5 to 1 s |
| When | it is dragged 20 pixels later |
| Then | the Project is asked to change its times to 0.7 to 1.2 s |

## `PV-052` Leaving every other Segment in place on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline whose Current Segment is the first of two |
| When | the second's end is dragged 20 pixels later |
| Then | nothing is asked of the Project |

## `PV-053` Stopping a dragged edge at the next Segment

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| When | its end is dragged 50 pixels later |
| Then | the Project is asked to change its times to 0 to 0.6 s |

## `PV-054` Snapping a dragged edge to the next Segment

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| When | its end is dragged 5 pixels later |
| Then | the Project is asked to change its times to 0 to 0.6 s |

## `PV-055` Snapping a dragged edge to where the media is

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the media at 0.8 s |
| When | its end is dragged 25 pixels later |
| Then | the Project is asked to change its times to 0 to 0.8 s |

## `PV-056` Not snapping while Shift is held

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| When | its end is dragged 5 pixels later with Shift held |
| Then | the Project is asked to change its times to 0 to 0.55 s |

## `PV-057` Turning snapping off on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| Given | snapping turned off |
| When | its end is dragged 5 pixels later |
| Then | the Project is asked to change its times to 0 to 0.55 s |

## `PV-058` Taking a drag back with Esc

| Step | Statement |
| --- | --- |
| Given | a timeline whose Current Segment's end is dragged 20 pixels later |
| Given | Esc pressed before it is let go |
| When | it is let go |
| Then | nothing is asked of the Project |

## `PV-059` Writing nothing for a drag that ends where it began

| Step | Statement |
| --- | --- |
| Given | a timeline whose Current Segment's end is dragged 20 pixels later and back |
| When | it is let go |
| Then | nothing is asked of the Project |

## `PV-060` Moving the edge two Segments share with Alt held

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.5 to 1 s |
| When | its end is dragged 20 pixels later with Alt held |
| Then | the Project is asked to move the edge after the first to 0.7 s |

## `PV-061` Holding the timeline while a Mode writes

| Step | Statement |
| --- | --- |
| Given | a timeline whose Current Resource is being transcribed, its Current Segment from 0 to 0.5 s |
| When | its end is dragged 20 pixels later |
| Then | nothing is asked of the Project |

## `PV-062` Inserting a Segment drawn on the timeline

Drawing on the empty waveform leaves a range to keep with Enter or drop with Esc, as Subtitle Edit does.

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with a range drawn from 1 to 1.5 s where no Segment is |
| When | Enter is pressed |
| Then | the Project is asked to insert a Segment from 1 to 1.5 s |

## `PV-063` Dropping a drawn range with Esc

| Step | Statement |
| --- | --- |
| Given | a timeline with one Segment and a range drawn where no Segment is |
| When | Esc is pressed |
| Then | the timeline marks only the Segment |

## `PV-064` Keeping a drawn range out of the next Segment

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with Segments from 0 to 0.5 s and from 1 to 1.5 s |
| When | a range is drawn from 0.7 to 1.2 s |
| Then | the range runs from 0.7 to 1 s |

## `PV-065` Setting the Current Segment's start where the media is with F11

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.2 s |
| When | F11 is pressed outside a field |
| Then | the Project is asked to change its times to 0.2 to 0.5 s |

## `PV-066` Setting the Current Segment's end where the media is with F12

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.8 s |
| When | F12 is pressed outside a field |
| Then | the Project is asked to change its times to 0 to 0.8 s |

## `PV-067` Keeping a time set with a key out of the next Segment

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the next from 0.6 s, the media at 0.8 s |
| When | F12 is pressed outside a field |
| Then | the Project is asked to change its times to 0 to 0.6 s |

### Reading times on the timeline

A time typed into a Segment is found on the waveform first, so the timeline tells the time under the pointer, and while a Segment is dragged or a range drawn, the times it will be written with.

## `PV-071` Showing the time under the pointer on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | the pointer rests 150 pixels from its start |
| Then | the time under it reads `00:00:01.500` |

## `PV-072` Showing where a dragged Segment lands

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| When | its end is dragged 5 pixels later and not yet let go |
| Then | the times read `00:00:00.000 → 00:00:00.600` |

## `PV-073` Showing the times of a range as it is drawn

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | a range is drawn from 1 to 1.5 s and not yet let go |
| Then | the times read `00:00:01.000 → 00:00:01.500` |

## `PV-074` Showing the times of a drawn range until it is dropped

| Step | Statement |
| --- | --- |
| Given | a timeline with a range drawn from 1 to 1.5 s |
| When | Esc is pressed |
| Then | no times are shown |
