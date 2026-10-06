<!--
  @component
  The editor's regions — the Preview's player, the timeline and the Segment list — laid out as the
  Layout chosen asks. Each Layout only moves the regions on a grid, never through the page, so the one
  player keeps playing as they move; only the Segment list scrolls.
-->
<script lang="ts">
  import type { ProjectView } from "#/ipc/project.ts";
  import type { Layout } from "#/state/layout-choice.svelte.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { PreviewFold } from "#/state/preview-fold.svelte.ts";
  import type { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import Preview from "#/components/Preview.svelte";
  import SegmentList from "#/components/SegmentList.svelte";
  import Timeline from "#/components/Timeline.svelte";

  interface Props {
    /** The open Project, as Page reads it. */
    project: ProjectView | null;
    layout: Layout;
    playback: Playback;
    fold: PreviewFold;
    captionChoices: CaptionChoices;
    viewChoices: ViewChoices;
    placeholders: ResourcePlaceholders;
  }

  let {
    project,
    layout,
    playback,
    fold,
    captionChoices,
    viewChoices,
    placeholders,
  }: Props = $props();

  /** Whether the player stands in a side column: V3's, until the video goes to the Video Window. */
  const hasSideColumn = $derived(layout === "v3" && !playback.isVideoAway);
  let segmentList: SegmentList;

  /** Opens the search bar above the Segment list. */
  export function openSearch(): void {
    segmentList.openSearch();
  }
</script>

<!-- V3 sets the list beside the player in a wide editor, the waveform beneath both; narrower, or
     with the video away, the player's controls stand across the top. The timeline shown after the player takes the line between them -->
<div
  class="group grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] [grid-template-areas:'preview'_'timeline'_'list'] data-has-side-column:@5xl:grid-cols-[minmax(0,1fr)_auto] data-has-side-column:@5xl:grid-rows-[minmax(0,1fr)_auto] data-has-side-column:@5xl:[grid-template-areas:'list_preview'_'timeline_timeline']"
  data-layout={layout}
  data-has-side-column={hasSideColumn ? "" : undefined}
>
  <div
    class="min-w-0 [grid-area:preview] has-[+div>:not([hidden])]:[&>*]:border-b-0 has-[+div>:not([hidden])]:[&>*]:pb-0 group-data-has-side-column:@5xl:overflow-y-auto group-data-has-side-column:@5xl:border-l group-data-has-side-column:@5xl:border-base-300 group-data-has-side-column:@5xl:has-[>:not([hidden])]:w-md"
  >
    <Preview {playback} {fold} choices={captionChoices} editorLayout={layout} />
  </div>
  <div
    class="min-w-0 [grid-area:timeline] group-data-has-side-column:@5xl:border-t group-data-has-side-column:@5xl:border-base-300"
  >
    <Timeline {playback} {fold} {viewChoices} />
  </div>
  <div class="min-h-0 min-w-0 overflow-y-auto p-4 [grid-area:list]">
    <SegmentList
      {project}
      {playback}
      {placeholders}
      {viewChoices}
      editorLayout={layout}
      bind:this={segmentList}
    />
  </div>
</div>
