<!--
  @component
  The rows of the Current Resource's Segments, refreshed in place as each Project is read, since
  Chromium reports a selection change for each time field drawn; rows are drawn anew only when the
  translation is shown or hidden. Placeholders stand in while Segments are being made or read. It
  marks the Current Segment and the rows being played, draws the Cursor, and lays the editor's
  comparison over the rows with each removed cue in its place; each field draws its own marks. Only
  the rows near what shows of the list are drawn, with the Current Segment's, the one with focus and
  one being brought into view wherever they are, space as tall as they were drawn standing in for
  the rest, and every row while the page has not laid the list out.
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
  import {
    comparisonLayout,
    type SideRow,
  } from "#/state/editor-comparison.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import type { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
  import { resourceOffers } from "#/actions/segment-changes.ts";
  import { drawnRanges, type ListView, rowOffsets } from "#/ui/row-window.ts";
  import RemovalRow from "#/components/RemovalRow.svelte";
  import SegmentRow from "#/components/SegmentRow.svelte";

  let {
    playback,
    placeholders,
    viewChoices,
    onshown,
    children,
    barsHeight = 0,
  }: {
    playback: Playback;
    placeholders: ResourcePlaceholders;
    viewChoices: ViewChoices;
    /** Hears each Project once its Segments are shown. */
    onshown?: (project: ProjectView | null) => void;
    /** What stands between the empty hint and the rows, as the search and checked bars do. */
    children?: Snippet;
    /** How tall what stands above the rows is, which a row brought into view stops below. */
    barsHeight?: number;
  } = $props();

  const feed = projectFeed();
  const session = editingSession();
  const editing = editingState();
  const run = taskRun();
  const comparison = editorComparison();
  /** How tall a row is taken to be until it is drawn and measured, in pixels. */
  const ROW_HEIGHT_ESTIMATE = 80;

  /** A row of the list: a Segment's, or a removed cue's before it. */
  type ListRow = { key: string } & ({ index: number } | { sideRow: SideRow });
  /** What the list draws in order: its rows, and the space standing in for those left out. */
  type ListEntry = ListRow | { key: string; height: number };

  let list = $state<HTMLOListElement>();
  const rows: SegmentRow[] = $state([]);
  setSegmentFields({ field, revealField });
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

  const sideRowKey = (sideRow: SideRow) => `${sideRow.side} ${sideRow.index}`;
  const listRows: ListRow[] = $derived([
    ...segments.flatMap((_, index) => [
      ...layout.removalsBefore[index].map((sideRow) => ({
        key: sideRowKey(sideRow),
        sideRow,
      })),
      { key: `${index}`, index },
    ]),
    ...(layout.removalsBefore[segments.length] ?? []).map((sideRow) => ({
      key: sideRowKey(sideRow),
      sideRow,
    })),
  ]);
  /** The height each row was drawn at, by its key. */
  let heightByKey = $state.raw(new Map<string, number>());
  /** What of the list shows, with no height while the page has not laid it out. */
  let listView = $state.raw<ListView>({ top: 0, height: 0 });
  const offsets = $derived(
    rowOffsets(
      listRows.map((row) => heightByKey.get(row.key) ?? ROW_HEIGHT_ESTIMATE),
    ),
  );
  /** The key of the row with focus inside, which stays drawn with what its focus opened. */
  let focusedKey = $state<string | null>(null);
  /** The Segment last brought into view by its position, whose row may not have been drawn. */
  let revealedIndex = $state<number | null>(null);
  /** The Segment started last while playback is followed, whose row is brought into view. */
  const followedIndex = $derived(
    playback.isFollowing
      ? (playback.playingIndexes[playback.playingIndexes.length - 1] ?? null)
      : null,
  );
  /**
   * The rows kept drawn wherever the list is scrolled: the Current Segment's, which may be typed
   * in, the one with focus, and those being brought into view.
   */
  const keptRowIndexes = $derived.by(() => {
    const keptIndexes = new Set([currentIndex, revealedIndex, followedIndex]);
    return listRows.flatMap((row, at) =>
      ("index" in row && keptIndexes.has(row.index)) || row.key === focusedKey
        ? [at]
        : [],
    );
  });
  const drawnEntries: ListEntry[] = $derived.by(() => {
    const entries: ListEntry[] = [];
    let drawnTo = 0;
    for (const { start, end } of drawnRanges(
      offsets,
      listView,
      keptRowIndexes,
    )) {
      if (start > drawnTo)
        entries.push({
          key: `gap ${drawnTo}`,
          height: offsets[start] - offsets[drawnTo],
        });
      entries.push(...listRows.slice(start, end));
      drawnTo = end;
    }
    if (drawnTo < listRows.length)
      entries.push({
        key: `gap ${drawnTo}`,
        height: offsets[listRows.length] - offsets[drawnTo],
      });
    return entries;
  });

  /** Reads what of the list shows: from where the window starts, as tall as the window. */
  function measureView(): void {
    if (!list) return;
    const box = list.getBoundingClientRect();
    const next =
      box.width > 0
        ? { top: -box.top, height: window.innerHeight }
        : { top: 0, height: 0 };
    if (next.top !== listView.top || next.height !== listView.height)
      listView = next;
  }

  /** Each row element drawn, with the key of the entry it draws; the rows are drawn in entry order. */
  function drawnRowKeys(): Map<Element, string> {
    const drawnRows = drawnEntries.filter((entry) => !("height" in entry));
    const elements = [...(list?.children ?? [])].filter(
      (element) =>
        !element.hasAttribute("data-gap") &&
        !element.hasAttribute("data-placeholder"),
    );
    return elements.length === drawnRows.length
      ? new Map(elements.map((element, at) => [element, drawnRows[at].key]))
      : new Map();
  }

  /** Notes the row focus moves into, or that it left the rows. */
  function followFocus({ type, target, relatedTarget }: FocusEvent): void {
    const inside = type === "focusin" ? target : relatedTarget;
    focusedKey = null;
    if (!(inside instanceof Node)) return;
    for (const [element, key] of drawnRowKeys())
      if (element.contains(inside)) focusedKey = key;
  }

  // Measures each row drawn, and again as its height changes
  $effect(() => {
    const keyByElement = drawnRowKeys();
    if (typeof ResizeObserver === "undefined" || keyByElement.size === 0)
      return;
    const observer = new ResizeObserver((resized) => {
      const next = new Map(heightByKey);
      let isChanged = false;
      for (const { target, borderBoxSize } of resized) {
        const key = keyByElement.get(target)!;
        const height = borderBoxSize[0].blockSize;
        isChanged ||= next.get(key) !== height;
        next.set(key, height);
      }
      if (isChanged) heightByKey = next;
      measureView();
    });
    for (const element of keyByElement.keys()) observer.observe(element);
    return () => observer.disconnect();
  });

  /** Whether the translation at `index` is of the Batch being translated, where the next ones land. */
  function isPendingAt(index: number): boolean {
    const batch = project?.pending_batch ?? null;
    return batch !== null && index >= batch.first && index <= batch.last;
  }

  /** The field of `kind` in the row of the Segment at `index`, or none while that row is not drawn. */
  export function field(index: number, kind: CursorField): HTMLElement | null {
    return rows[index]?.field(kind) ?? null;
  }

  /**
   * Draws the row of the Segment at `index` and brings it into view, answering its field of
   * `kind`, or none for a translation not shown.
   */
  export function revealField(
    index: number,
    kind: CursorField,
  ): HTMLElement | null {
    revealedIndex = index;
    flushSync();
    rows[index]?.bringIntoView();
    return field(index, kind);
  }

  function show(next: ProjectView | null): void {
    const drawnCount = placeholders.isShown ? 0 : segments.length;
    isTypingKept = (next?.segments.length ?? 0) === drawnCount;
    project = next;
    view = session.transcript;
    placeholders.hide();
    measureView();
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
    const index = followedIndex;
    if (index !== null) untrack(() => rows[index]?.bringIntoView());
  });
</script>

<svelte:window
  onkeydown={followShortcut}
  onresize={measureView}
  onpointerup={() => session.releasePointer()}
/>
<svelte:document
  onselectionchange={followSelection}
  onscrollcapture={measureView}
/>

{#if segments.length === 0 && placeholderCount === 0}
  <p class="text-base-content/60">{t("edit.empty")}</p>
{/if}
{@render children?.()}
<ol
  class="list @container text-[15px] [&_.field]:block [&_.field]:min-h-8 [&_.field]:w-full [&_.field]:whitespace-pre-wrap [&_.field]:rounded-field [&_.field]:border [&_.field]:border-transparent [&_.field]:px-1.5 [&_.field]:py-1 [&_.field]:hover:border-base-300 [&_.field]:focus:border-base-content/40 [&_.field]:focus:outline-none [&_.field]:caret-transparent [&_.field]:selection:bg-transparent [&_.field::highlight(cursor)]:bg-primary/30 [&_.field:empty]:before:pointer-events-none [&_.field:empty]:before:text-base-content/40 [&_.field:empty]:before:content-[attr(data-placeholder)] [&_.field.translation]:text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))] [&_.field::highlight(compare-addition)]:bg-success/30 [&_.field::highlight(search-match)]:bg-warning/30 [&_.field::highlight(search-current)]:bg-warning/70 [&_.field::highlight(glossary-term)]:underline [&_.field::highlight(glossary-term)]:decoration-primary [&_.field::highlight(glossary-candidate)]:underline [&_.field::highlight(glossary-candidate)]:decoration-dashed [&_.field::highlight(glossary-candidate)]:decoration-base-content/40 [&_time]:pt-1.5 [&_time]:text-xs [&_time]:text-base-content/60 [&_time]:tabular-nums [&>li:not([data-gap])]:list-row [&>li]:scroll-mt-(--bars-height) [&>li]:cursor-default [&>li[aria-current]]:bg-primary/10 [&>li[data-is-playing]]:shadow-[inset_3px_0_0_var(--color-primary)]"
  style:--bars-height="{barsHeight}px"
  aria-label={t("edit.segments")}
  onfocusin={followFocus}
  onfocusout={followFocus}
  bind:this={list}
>
  {#if !placeholders.isShown}
    {#key offers.isTranslationShown}
      {#each drawnEntries as entry (entry.key)}
        {#if "height" in entry}
          <li data-gap aria-hidden="true" style:height="{entry.height}px"></li>
        {:else if "sideRow" in entry}
          <RemovalRow sideRow={entry.sideRow} />
        {:else}
          {@const index = entry.index}
          <SegmentRow
            bind:this={rows[index]}
            segment={segments[index]}
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
        {/if}
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
