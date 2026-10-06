# Layout

How the editor's regions are arranged while the layouts are tried side by side. The file goes once a layout is chosen: the chosen layout's scenarios return to the files of their features, and the others are deleted with their code.

## Includes

- `src/components/Preview.test.ts`
- `src/components/current-segment.test.ts`

## `LY-001` Showing the Current Segment beside the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments |
| When | the second Segment's row is clicked |
| Then | the card beside the video shows #2 with its times, text and translation |

## `LY-002` Naming the Current Segment's Speaker beside the video

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a media file and two Segments, the second said by `小明` |
| When | the second Segment's row is clicked |
| Then | the card beside the video names `小明` |

## `LY-003` Naming no one beside the video for a Segment without a Speaker

| Step | Statement |
| --- | --- |
| Given | the second Segment current, said by `小明` |
| When | the first Segment's row, said by no one, is clicked |
| Then | the card beside the video names no Speaker |

## `LY-004` Following an edit of the Current Segment beside the video

| Step | Statement |
| --- | --- |
| Given | the second Segment current, reading `今天` |
| When | its text is changed to `明天` |
| Then | the card beside the video shows `明天` |

## `LY-005` Leaving only the controls above the timeline while the video is away

Once the video has left, the Current Segment's card repeats the row being edited in the list, so the Preview keeps only its controls and gives the height to the editor.

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a video |
| When | the Video Window button is pressed |
| Then | the Preview shows its controls without the Current Segment's card |

## `LY-006` Showing the Current Segment's card again as the video comes back

| Step | Statement |
| --- | --- |
| Given | a Current Resource with a video in the Video Window |
| When | the Video Window button is pressed again |
| Then | the Preview shows the Current Segment's card beside the video |
