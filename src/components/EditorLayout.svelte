<!--
  @component
  The editor's regions — the Preview's player, the timeline and the Segment list — laid out as the
  Layout asks. Each Layout only moves the regions on a grid, never through the page, so the one
  player keeps playing as they move; only the Segment list scrolls.
-->
<script module lang="ts">
  /** The arrangements of the editor's regions on trial, until one is kept. */
  export type Layout = "v1";
</script>

<script lang="ts">
  import type { ProjectView } from "#/ipc/project.ts";
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

  let segmentList: SegmentList;

  /** Opens the search bar above the Segment list. */
  export function openSearch(): void {
    segmentList.openSearch();
  }
</script>

<div
  class="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] [grid-template-areas:'preview'_'timeline'_'list']"
  data-layout={layout}
>
  <div class="min-w-0 [grid-area:preview]">
    <Preview {playback} {fold} choices={captionChoices} />
  </div>
  <div class="min-w-0 [grid-area:timeline]">
    <Timeline {playback} {fold} {viewChoices} />
  </div>
  <div class="min-h-0 min-w-0 overflow-y-auto p-4 [grid-area:list]">
    <SegmentList
      {project}
      {playback}
      {placeholders}
      {viewChoices}
      bind:this={segmentList}
    />
  </div>
</div>
