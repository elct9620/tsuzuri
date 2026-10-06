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

## `LY-007` Showing the Current Segment's length in its row

In the layouts without the card, the row being edited carries what the card showed.

| Step | Statement |
| --- | --- |
| Given | Layout V2, a Current Resource whose second Segment runs from 1 to 4.2 s |
| When | the second Segment's row is clicked |
| Then | that row shows `3.200s` |

## `LY-008` Showing the keys for the Current Segment in its row

| Step | Statement |
| --- | --- |
| Given | Layout V2, a Current Resource with two Segments |
| When | the second Segment's row is clicked |
| Then | that row shows Space and the keys setting its times |

## `LY-009` Folding up the row left behind

| Step | Statement |
| --- | --- |
| Given | Layout V2, the second Segment current |
| When | the first Segment's row is clicked |
| Then | the second row shows no length |

## `LY-010` Keeping the chosen row where it stands

| Step | Statement |
| --- | --- |
| Given | Layout V2, the first Segment current with its row unfolded |
| When | the second Segment's row is clicked |
| Then | the second row stays where it stood on screen |
| unverifiable | happy-dom lays nothing out; the Chrome probe measures it |

## `LY-011` Leaving out the Current Segment's card where the row unfolds

| Step | Statement |
| --- | --- |
| Given | Layout V2, a Current Resource with a media file and two Segments |
| When | the second Segment's row is clicked |
| Then | the Preview shows no Current Segment card |
