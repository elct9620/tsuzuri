<!--
  @component
  The rows of the Current Resource's Segments, refreshed in place as each Project is read, since
  Chromium reports a selection change for each time field drawn; rows are drawn anew only when the
  translation is shown or hidden. Placeholders stand in while Segments are being made or read. It
  marks the Current Segment and the rows being played, draws the Cursor, and lays the editor's
  comparison over the rows with each removed cue in its place; each field draws its own marks.
-->
<script lang="ts">
  import { flushSync, onMount, type Snippet, untrack } from "svelte";

  import type { ProjectView } from "#/ipc/project.ts";
  import { isMacOS } from "#/ipc/system.ts";
  import {
    CURSOR_HIGHLIGHT,
    type Cursor,
    type CursorField,
    isField,
    markRanges,
    placeSelection,
    rangeOf,
    type TranscriptView,
  } from "#/editor/index.ts";
  import { t } from "#/i18n.ts";
  import { isEditorCovered } from "#/ui/editor-cover.ts";
  import { isShortcut } from "#/ui/shortcuts.ts";
  import {
    editingSession,
    editingState,
    editorComparison,
    projectFeed,
    setSegmentFields,
    taskRun,
  } from "#/state/context.ts";
  import { comparisonLayout } from "#/state/editor-comparison.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import type { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
  import { resourceOffers } from "#/actions/segment-changes.ts";
  import RemovalRow from "#/components/RemovalRow.svelte";
  import SegmentRow from "#/components/SegmentRow.svelte";

  let {
    playback,
    placeholders,
    viewChoices,
    onshown,
    children,
  }: {
    playback: Playback;
    placeholders: ResourcePlaceholders;
    viewChoices: ViewChoices;
    /** Hears each Project once its Segments are shown. */
    onshown?: (project: ProjectView | null) => void;
    /** What stands between the empty hint and the rows, as the search and checked bars do. */
    children?: Snippet;
  } = $props();

  const feed = projectFeed();
  const session = editingSession();
  const editing = editingState();
  const run = taskRun();
  const comparison = editorComparison();
  let list = $state<HTMLOListElement>();
  const rows: SegmentRow[] = $state([]);
  setSegmentFields({ field });
  let project = $state.raw<ProjectView | null>(null);
  /** The transcript as the session read it with the Project, whose running Mode holds fields. */
  let view = $state.raw<TranscriptView | null>(null);
  /** Whether a field being typed in keeps its value: the Segments kept their number. */
  let isTypingKept = $state(true);
  const currentIndex = $derived(editing.cursor.index);
  const checkedIndexes = $derived(new Set(editing.checkedIndexes));
  /** The position of the Current Segment as its row was last brought into view. */
  let shownCurrentIndex: number | null = null;

  const segments = $derived(project?.segments ?? []);
  /** Whether rows show the Speaker column: once a Segment names a Speaker, or as the View menu asks. */
  const isSpeakerColumnShown = $derived(
    viewChoices.isSpeakerColumnShown ||
      segments.some((segment) => (segment.speaker ?? "") !== ""),
  );
  const offers = $derived(resourceOffers(project));
  const layout = $derived(
    comparisonLayout(
      segments,
      comparison.rowsBySide,
      comparison.cuesByLanguage,
    ),
  );
  const isTranscribing = $derived(run.task === "transcription");
  const isAwaitingSegments = $derived(segments.length === 0 && isTranscribing);
  const placeholderCount = $derived(
    placeholders.isShown || isAwaitingSegments
      ? 3
      : isTranscribing && segments.length > 0
        ? 1
        : 0,
  );

  /** Whether the translation at `index` is of the Batch being translated, where the next ones land. */
  function isPendingAt(index: number): boolean {
    const batch = project?.pending_batch ?? null;
    return batch !== null && index >= batch.first && index <= batch.last;
  }

  /** The field of `kind` in the row of the Segment at `index`, or none while that row is not drawn. */
  export function field(index: number, kind: CursorField): HTMLElement | null {
    return rows[index]?.field(kind) ?? null;
  }

  function show(next: ProjectView | null): void {
    const drawnCount = placeholders.isShown ? 0 : segments.length;
    isTypingKept = (next?.segments.length ?? 0) === drawnCount;
    project = next;
    view = session.transcript;
    placeholders.hide();
    flushSync();
    onshown?.(next);
  }

  onMount(() => feed.follow(show));

  /**
   * Brings the Current Segment's row into view as it becomes current, so the Cursor moving within
   * it leaves the list where following playback put it; a live Cursor in a field without focus, as
   * after a split, takes the focus there.
   */
  function followCursor({ index, caret }: Cursor): void {
    const isNewlyCurrent = index !== shownCurrentIndex;
    shownCurrentIndex = index;
    if (index === null) return;
    if (isNewlyCurrent) rows[index]?.bringIntoView();
    const caretField = caret && field(index, caret.field);
    if (
      caretField &&
      caret?.kind === "live" &&
      document.activeElement !== caretField
    ) {
      caretField.focus();
      placeSelection(caretField, caret);
    }
  }

  // Marks the range the Cursor covers, in the field as it is now drawn
  $effect(() => {
    const { index, caret } = editing.cursor;
    const rangeField =
      index !== null && caret && caret.start !== caret.end
        ? field(index, caret.field)
        : null;
    markRanges(
      CURSOR_HIGHLIGHT,
      rangeField && caret ? [rangeOf(rangeField, caret)] : [],
    );
  });

  // Shows each Cursor the session tells of, once the rows it moves into are drawn
  $effect(() => {
    const cursor = editing.cursor;
    untrack(() => followCursor(cursor));
  });

  /**
   * Hands a selection change to the row whose field has focus; bound once on the document, as each
   * change reaches every listener there and a row drawn with its time fields reports one each.
   */
  function followSelection(): void {
    const { activeElement } = document;
    if (isField(activeElement) && list?.contains(activeElement))
      rows[Number(activeElement.dataset.index)]?.followSelection();
  }

  /** Turns following playback on or off by its shortcut, wherever the focus is. */
  function followShortcut(event: KeyboardEvent): void {
    if (!isShortcut(event, "following", isMacOS()) || isEditorCovered()) return;
    event.preventDefault();
    playback.toggleFollowing();
  }

  // Keeps the row of the Segment started last in view while following playback, and catches up
  // with it as following playback comes on
  $effect(() => {
    const indexes = playback.playingIndexes;
    const index = indexes[indexes.length - 1];
    if (playback.isFollowing && index !== undefined)
      untrack(() => rows[index]?.bringIntoView());
  });
</script>

<svelte:window
  onkeydown={followShortcut}
  onpointerup={() => session.releasePointer()}
/>
<svelte:document onselectionchange={followSelection} />

{#if segments.length === 0 && placeholderCount === 0}
  <p class="text-base-content/60">{t("edit.empty")}</p>
{/if}
{@render children?.()}
<!-- Rows off screen skip their layout and painting; a row with focus inside shows whole, as its menus open past its edge -->
<ol
  class="list @container text-[15px] [&_.field]:block [&_.field]:min-h-8 [&_.field]:w-full [&_.field]:whitespace-pre-wrap [&_.field]:rounded-field [&_.field]:border [&_.field]:border-transparent [&_.field]:px-1.5 [&_.field]:py-1 [&_.field]:hover:border-base-300 [&_.field]:focus:border-base-content/40 [&_.field]:focus:outline-none [&_.field]:caret-transparent [&_.field]:selection:bg-transparent [&_.field::highlight(cursor)]:bg-primary/30 [&_.field:empty]:before:pointer-events-none [&_.field:empty]:before:text-base-content/40 [&_.field:empty]:before:content-[attr(data-placeholder)] [&_.field.translation]:text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))] [&_.field::highlight(compare-addition)]:bg-success/30 [&_.field::highlight(search-match)]:bg-warning/30 [&_.field::highlight(search-current)]:bg-warning/70 [&_.field::highlight(glossary-term)]:underline [&_.field::highlight(glossary-term)]:decoration-primary [&_.field::highlight(glossary-candidate)]:underline [&_.field::highlight(glossary-candidate)]:decoration-dashed [&_.field::highlight(glossary-candidate)]:decoration-base-content/40 [&_time]:pt-1.5 [&_time]:text-xs [&_time]:text-base-content/60 [&_time]:tabular-nums [&>li]:list-row [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_5rem] [&>li:focus-within]:[content-visibility:visible] [&>li]:cursor-default [&>li[aria-current]]:bg-primary/10 [&>li[data-is-playing]]:shadow-[inset_3px_0_0_var(--color-primary)]"
  aria-label={t("edit.segments")}
  bind:this={list}
>
  {#if !placeholders.isShown}
    {#key offers.isTranslationShown}
      {#each segments as segment, index (index)}
        {#each layout.removalsBefore[index] as sideRow (`${sideRow.side} ${sideRow.index}`)}
          <RemovalRow {sideRow} />
        {/each}
        <SegmentRow
          bind:this={rows[index]}
          {segment}
          {index}
          count={segments.length}
          {view}
          {offers}
          isPending={isPendingAt(index)}
          isChecked={checkedIndexes.has(index)}
          isCurrent={currentIndex === index}
          isPlaying={playback.playingIndexes.includes(index)}
          {isTypingKept}
          {isSpeakerColumnShown}
          comparison={layout.bySegment[index]}
          glossaryMarks={project?.glossary_marks[index]}
        />
      {/each}
      {#each layout.removalsBefore[segments.length] as sideRow (`${sideRow.side} ${sideRow.index}`)}
        <RemovalRow {sideRow} />
      {/each}
    {/key}
  {/if}
  {#each { length: placeholderCount }, at (at)}
    <li data-placeholder class="flex flex-col gap-2 py-2">
      <div class="skeleton h-4 w-48"></div>
      <div class="skeleton h-10 w-full"></div>
    </li>
  {/each}
</ol>
