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

## `PV-088` Showing the Segment over the video as soon as the media reaches it

A player reports its time only a few times a second, so while the media plays what is shown over the video follows each frame drawn, and a caption comes with its words rather than up to a quarter second after.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` from 0 to 1 s and `今天` from 1 to 2 s, its media playing |
| When | the next frame is drawn at 1.05 s, before the player reports its time |
| Then | `今天` is shown over the video |


## `PV-103` Showing a Segment that overlaps another above it

Someone cutting in speaks over the Segment already shown, so every Segment being played is shown, each one above the Segments that started before it, as players stack overlapping cues.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` from 0 to 2 s and `對啊` from 1 to 1.5 s |
| When | it plays to 1.2 s |
| Then | `對啊` is shown over the video above `大家好` |

## `PV-104` Keeping a Segment over the video once the one over it ends

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` from 0 to 2 s and `對啊` from 1 to 1.5 s |
| When | it plays to 1.8 s |
| Then | `大家好` alone is shown over the video |

## `PV-105` Stacking Segments that start together in their order

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` and `對啊`, both from 0 to 1 s |
| When | it plays to 0.5 s |
| Then | `對啊` is shown over the video above `大家好` |
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


## `PV-107` Laying overlapping Segments in Lanes on the timeline

Regions that overlap would hide one another, so each Segment lies in the lowest Lane free at its start, the Lanes sharing the waveform's height, and each region can be clicked and dragged on its own. The Lanes stack upward as the Segments over the video do.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and Segments from 0 to 2 s and from 1 to 1.5 s |
| When | the Project is shown |
| Then | the first region fills the lower half of the waveform and the second the upper half |

## `PV-108` Keeping a Segment that overlaps none at full height

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and Segments from 0 to 2 s, from 1 to 1.5 s and from 3 to 4 s |
| When | the Project is shown |
| Then | the third region fills the waveform's full height |

## `PV-109` Making a Segment in an upper Lane current from the timeline

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and Segments from 0 to 2 s and from 1 to 1.5 s, the first current |
| When | the second Segment's region is clicked |
| Then | that Segment's row alone is marked as the Current Segment |

## `PV-110` Drawing the Current Segment's region above the others

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the first Segment's row is clicked |
| Then | its region is drawn above the second's |
## `PV-028` Playing the Current Segment alone with Space

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource whose Current Segment runs from 1 to 2 s, the media at 1.5 s, with playing alone turned on |
| When | Space is pressed outside a field or a control reached by keyboard |
| Then | the media plays from 1 s |

## `PV-029` Stopping at the end of the Current Segment

| Step | Statement |
| --- | --- |
| Given | the Current Segment from 1 to 2 s playing after Space, with playing alone turned on |
| When | the media reaches 2 s |
| Then | the media pauses |

## `PV-030` Stopping the media with Space

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose media is playing |
| When | Space is pressed outside a field or a control reached by keyboard |
| Then | the media pauses |

## `PV-031` Leaving Space to the field being typed in

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource with a Current Segment |
| When | Space is pressed in a Segment's text field |
| Then | the media stays paused |

## `PV-121` Playing with Space after a button is clicked

A button clicked keeps the focus, yet Space pressed afterward is meant for the media, not to press the button again.

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource with a Current Segment, with playing alone turned off |
| When | the playing alone button is clicked and Space is pressed |
| Then | the media plays and playing alone stays on |

## `PV-122` Leaving Space to a button reached by keyboard

| Step | Statement |
| --- | --- |
| Given | a paused Current Resource with a Current Segment |
| When | the playing alone button is reached by keyboard and Space is pressed |
| Then | the media stays paused |

## `PV-032` Marking the Segment being played in the editor

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing |
| When | the media plays to 1.5 s |
| Then | the second Segment's row alone is marked as playing |

## `PV-111` Marking every Segment being played in the editor

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 2 s and from 1 to 1.5 s, its media playing |
| When | the media plays to 1.2 s |
| Then | both rows are marked as playing |

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

## `PV-097` Naming the Current Segment's Speaker beside the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments, the second said by `小明` |
| When | the second Segment's row is clicked |
| Then | the card beside the video names `小明` |

## `PV-098` Naming no one beside the video for a Segment without a Speaker

| Step | Statement |
| --- | --- |
| Given | the second Segment current, said by `小明` |
| When | the first Segment's row, said by no one, is clicked |
| Then | the card beside the video names no Speaker |

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

### Choosing another Segment

Another Segment chosen is the one to be heard next, so the media pauses there for Space: a row at its start, a region where it was clicked, as the waveform does elsewhere. Staying in the Current Segment, or a Segment Change moving it, plays on, so a text is corrected while heard.

## `PV-075` Pausing at the start of a Segment whose row is chosen

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing at 0.5 s |
| When | the second Segment's row is clicked |
| Then | the media pauses at 1 s |

## `PV-076` Moving the paused media to a Segment whose row is chosen

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media paused at 0.5 s |
| When | the second Segment's row is clicked |
| Then | the media stays paused at 1 s |

## `PV-077` Pausing where a Segment's region is clicked

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing at 0.5 s |
| When | the second Segment's region is clicked at 1.5 s |
| Then | the media pauses at 1.5 s |

## `PV-078` Playing on when the Current Segment's row is clicked

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose second Segment is current, its media playing |
| When | the second Segment's row is clicked |
| Then | the media keeps playing |

## `PV-079` Playing on when a Segment Change moves the Current Segment

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose first Segment is current, its media playing |
| When | a Segment is inserted after it from its menu |
| Then | the media keeps playing |

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

## `PV-092` Showing the Speaker over the video by default

A cue is saved with its Speaker's name before the dialogue, so what is over the video names who says it too.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s said by `小明`, and the Speaker over the video never turned off on this machine |
| When | the media plays to 0.5 s |
| Then | `小明: 今天` is shown over the video |

## `PV-093` Naming the Speaker in the translation over the video as the Translation Glossary does

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s said by `小明`, translated `Today` in the translation shown, where the Translation Glossary names `小明` as `Xiao Ming` |
| When | the translation is chosen over the video and the media plays to 0.5 s |
| Then | `Xiao Ming: Today` is shown over the video |

## `PV-094` Naming the Speaker in both languages over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s said by `小明`, translated `Today` in the translation shown, where the Translation Glossary names `小明` as `Xiao Ming` |
| When | both languages are chosen over the video and the media plays to 0.5 s |
| Then | `小明: 今天` is shown over the video above `Xiao Ming: Today` |


## `PV-106` Naming the Speaker of each overlapping Segment over the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments `大家好` from 0 to 2 s said by `小明` and `對啊` from 1 to 1.5 s said by `小華` |
| When | the media plays to 1.2 s |
| Then | `小華: 對啊` is shown over the video above `小明: 大家好` |
## `PV-095` Turning the Speaker over the video off

| Step | Statement |
| --- | --- |
| Given | a Current Resource with the Segment `今天` from 0 to 1 s said by `小明` |
| When | the Speaker over the video is turned off and the media plays to 0.5 s |
| Then | `今天` alone is shown over the video |

## `PV-096` Keeping the Speaker over the video off for the next Resource

| Step | Statement |
| --- | --- |
| Given | the Speaker over the video turned off |
| When | another Resource with a media file becomes current |
| Then | the Speaker over the video stays off |

### Retiming on the timeline

Subtitle editors retime a cue on its waveform: an edge or the whole cue is dragged and written once let go, snapping to what is near only while Shift is held, unless snapping is turned on, as in Aegisub. Only the Current Segment moves, so a click on a narrow region still selects it. A Segment may be dragged over its neighbours, as someone cutting in speaks over them, but its start stays between their starts, so the Segments keep the order they start in.

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

## `PV-053` Overlapping the next Segment with a dragged end

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| When | its end is dragged 50 pixels later |
| Then | the Project is asked to change its times to 0 to 1 s |

## `PV-112` Stopping a dragged start at the previous Segment's start

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 1 to 1.5 s, the previous from 0.5 to 1 s |
| When | its start is dragged 80 pixels earlier |
| Then | the Project is asked to change its times to 0.5 to 1.5 s |

## `PV-113` Stopping a moved Segment at the next Segment's start

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 to 1.2 s |
| When | it is dragged 100 pixels later |
| Then | the Project is asked to change its times to 0.6 to 1.1 s |

## `PV-114` Laying a dragged Segment in a Lane as it overlaps the next

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 to 1.2 s |
| When | its end is dragged 50 pixels later and not yet let go |
| Then | the two regions lie in two Lanes |

## `PV-054` Snapping a dragged edge to the next Segment

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| Given | snapping turned on |
| When | its end is dragged 5 pixels later |
| Then | the Project is asked to change its times to 0 to 0.6 s |

## `PV-055` Snapping a dragged edge to where the media is

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the media at 0.8 s |
| Given | snapping turned on |
| When | its end is dragged 25 pixels later |
| Then | the Project is asked to change its times to 0 to 0.8 s |

## `PV-056` Not snapping while Shift is held

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| Given | snapping turned on |
| When | its end is dragged 5 pixels later with Shift held |
| Then | the Project is asked to change its times to 0 to 0.55 s |

## `PV-057` Turning snapping off on the timeline

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s |
| Given | snapping turned off |
| When | its end is dragged 5 pixels later |
| Then | the Project is asked to change its times to 0 to 0.55 s |

## `PV-099` Not snapping unless it is chosen

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s, and no choice about snapping ever made on this machine |
| When | its end is dragged 5 pixels later |
| Then | the Project is asked to change its times to 0 to 0.55 s |

## `PV-100` Snapping while Shift is held

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 0.5 s, the next from 0.6 s, and no choice about snapping ever made on this machine |
| When | its end is dragged 5 pixels later with Shift held |
| Then | the Project is asked to change its times to 0 to 0.6 s |

## `PV-101` Keeping snapping on for the next Resource

| Step | Statement |
| --- | --- |
| Given | snapping turned on |
| When | another Resource with a media file becomes current |
| Then | snapping stays on |

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

Drawing on the waveform leaves a range to keep with Enter or drop with Esc, as Subtitle Edit does. A press on a region chooses or drags its Segment, so a range over Segments is drawn with Ctrl held, or ⌘ on macOS, where Ctrl and a click open the context menu.

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

## `PV-102` Keeping a drawn range when Esc is pressed in a text field

Esc in a text field gives up what was typed there, which asks nothing of the timeline.

| Step | Statement |
| --- | --- |
| Given | a timeline with one Segment, a range drawn where no Segment is, and focus in a text field |
| When | Esc is pressed |
| Then | the timeline marks the Segment and the range |

## `PV-064` Drawing a range over the next Segment

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with Segments from 0 to 0.5 s and from 1 to 1.5 s |
| When | a range is drawn from 0.7 to 1.2 s |
| Then | the range runs from 0.7 to 1.2 s |

## `PV-115` Drawing a range over a Segment with Ctrl held

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with one Segment from 0 to 2 s, not current, on Windows or Linux |
| When | a range is drawn from 0.5 to 1 s on its region with Ctrl held |
| Then | the range runs from 0.5 to 1 s and no Segment is made current |

## `PV-116` Drawing a range over a Segment with ⌘ held on macOS

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with one Segment from 0 to 2 s, not current, on macOS |
| When | a range is drawn from 0.5 to 1 s on its region with ⌘ held |
| Then | the range runs from 0.5 to 1 s and no Segment is made current |

## `PV-117` Drawing a range over the Current Segment without moving it

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second whose Current Segment runs from 0 to 2 s, on Windows or Linux |
| When | a range is drawn from 0.5 to 1 s on its region with Ctrl held |
| Then | the range runs from 0.5 to 1 s and nothing is asked of the Project |

## `PV-118` Drawing no range over a Segment without the key

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second with one Segment from 0 to 2 s, not current |
| When | the pointer is dragged from 0.5 to 1 s on its region |
| Then | no range is drawn |

## `PV-065` Setting the Current Segment's start where the media is with F11

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.2 s, on Windows or Linux |
| When | F11 is pressed outside a field |
| Then | the Project is asked to change its times to 0.2 to 0.5 s |

## `PV-066` Setting the Current Segment's end where the media is with F12

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.8 s |
| When | F12 is pressed outside a field |
| Then | the Project is asked to change its times to 0 to 0.8 s |

## `PV-067` Overlapping the next Segment with a time set with a key

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the next from 0.6 s, the media at 0.8 s |
| When | F12 is pressed outside a field |
| Then | the Project is asked to change its times to 0 to 0.8 s |

## `PV-119` Keeping a start set with a key from before the previous Segment's start

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0.6 to 1 s, the previous from 0.3 to 0.5 s, the media at 0.2 s, on Windows or Linux |
| When | F11 is pressed outside a field |
| Then | the Project is asked to change its times to 0.3 to 1 s |

## `PV-089` Setting the Current Segment's start with F9 on macOS

macOS takes F11 to show the desktop, so the start is set with F9 there, as Subtitle Edit binds it on macOS; F12 sets the end everywhere.

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.2 s, on macOS |
| When | F9 is pressed outside a field |
| Then | the Project is asked to change its times to 0.2 to 0.5 s |

## `PV-090` Leaving F11 to macOS

| Step | Statement |
| --- | --- |
| Given | a Current Segment from 0 to 0.5 s, the media at 0.2 s, on macOS |
| When | F11 is pressed outside a field |
| Then | nothing is asked of the Project and the key is left to the system |

## `PV-091` Naming the keys that set times for the platform

| Step | Statement |
| --- | --- |
| Given | the preview on macOS |
| When | it is shown |
| Then | its hint names F9 and F12 as the keys that set the start and the end |

### Reading times on the timeline

A time typed into a Segment is found on the waveform first, so the timeline tells the time under the pointer in the form the field takes, as Aegisub does; and while a Segment is dragged or a range drawn, the times it will be written with and how long it runs, as Subtitle Edit shows a drawn range's length.

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
| Given | snapping turned on |
| When | its end is dragged 5 pixels later and not yet let go |
| Then | the times read `00:00:00.000 → 00:00:00.600 (0.600s)` |

## `PV-073` Showing the times of a range as it is drawn

| Step | Statement |
| --- | --- |
| Given | a timeline at 100 pixels a second |
| When | a range is drawn from 1 to 1.5 s and not yet let go |
| Then | the times read `00:00:01.000 → 00:00:01.500 (0.500s)` |

## `PV-074` Showing the times of a drawn range until it is dropped

| Step | Statement |
| --- | --- |
| Given | a timeline with a range drawn from 1 to 1.5 s |
| When | Esc is pressed |
| Then | no times are shown |

### Following playback in the editor

The editor scrolls to the row being played, the one started last while Segments overlap, unless the user turns that off to look through other Segments, or to keep correcting the Current Segment while the media plays on past it, as Subtitle Edit's "Select current subtitle while playing" can be. Only the scrolling stops; the row is still marked.

## `PV-080` Bringing the row being played into view

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing, and no choice about following playback ever made on this machine |
| When | the media plays to 1.5 s |
| Then | the second Segment's row is scrolled into view |


## `PV-120` Bringing the row of the Segment started last into view

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 2 s and from 1 to 1.5 s, its media playing, and following playback on |
| When | the media plays to 1.2 s |
| Then | the second Segment's row is scrolled into view |
## `PV-081` Leaving the editor where it is while not following playback

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, its media playing, and following playback turned off |
| When | the media plays to 1.5 s |
| Then | the second Segment's row alone is marked as playing, and no row is scrolled into view |

## `PV-082` Turning following playback off with Ctrl+L while typing

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose media is playing, with the Cursor in the Current Segment's text field |
| When | Ctrl+L is pressed |
| Then | following playback is turned off, and the field keeps the focus |

## `PV-083` Bringing the row being played into view as following playback is turned on

| Step | Statement |
| --- | --- |
| Given | the second Segment's row marked as playing, with following playback turned off |
| When | following playback is turned on |
| Then | the second Segment's row is scrolled into view |

## `PV-084` Keeping following playback off for the next Resource

| Step | Statement |
| --- | --- |
| Given | following playback turned off |
| When | another Resource with a media file becomes current |
| Then | following playback stays off |

### Playing the Current Segment alone

Space plays on from where the media is, so a Segment chosen is heard with the ones after it, and Space pauses it again when a line needs correcting. Playing only the Current Segment from its start, stopping at its end, is turned on when one line is heard over and over.

## `PV-085` Playing on from the Current Segment with Space

| Step | Statement |
| --- | --- |
| Given | a Current Resource with Segments from 0 to 1 s and from 1 to 2 s, and no choice about playing alone ever made on this machine |
| When | the second Segment's row is clicked and Space is pressed outside a field or a control reached by keyboard |
| Then | the media plays from 1 s, and plays on at 2 s |

## `PV-086` Playing on from where the media paused

| Step | Statement |
| --- | --- |
| Given | a Current Resource whose Current Segment runs from 1 to 2 s, the media paused at 1.5 s, with playing alone turned off |
| When | Space is pressed outside a field or a control reached by keyboard |
| Then | the media plays from 1.5 s |

## `PV-087` Keeping playing alone on for the next Resource

| Step | Statement |
| --- | --- |
| Given | playing alone turned on |
| When | another Resource with a media file becomes current |
| Then | playing alone stays on |
