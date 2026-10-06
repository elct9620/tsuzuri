<!--
  @component
  The Segments of the Current Resource with the search and checked bars above them, searched
  again as each Project is shown, and the keys and Edit menu commands that reach them: checking
  every Segment, deleting, merging with a neighbour, and cleaning Simplified Chinese out of what
  is marked.
-->
<script lang="ts">
  import type { EditCommand, ProjectView } from "#/ipc/project.ts";
  import { isMacOS } from "#/ipc/system.ts";
  import {
    isHeld,
    isTextField,
    type MergeDirection,
    type Outcome,
    runWithNeighbour,
  } from "#/editor/index.ts";
  import { notifyEdit } from "#/state/notification.svelte.ts";
  import { isComposingKey, isShortcut } from "#/ui/shortcuts.ts";
  import CheckedBar from "#/components/CheckedBar.svelte";
  import { cleanMarked } from "#/actions/cleanup.ts";
  import { editingSession } from "#/state/context.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { ViewChoices } from "#/state/view-choices.svelte.ts";
  import type { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
  import SearchBar from "#/components/SearchBar.svelte";
  import SegmentRows from "#/components/SegmentRows.svelte";

  let {
    project,
    playback,
    placeholders,
    viewChoices,
  }: {
    project: ProjectView | null;
    playback: Playback;
    placeholders: ResourcePlaceholders;
    viewChoices: ViewChoices;
  } = $props();
  const session = editingSession();
  let searchBar: SearchBar;
  /** A change by key is being sent. */
  let isChangingByKey = false;

  /** Whether the user is working in an open dialog, a menu or a drop-down list, which a change by key leaves alone. */
  function isWorkingElsewhere(target: EventTarget | null): boolean {
    return (
      document.querySelector("dialog[open]") !== null ||
      (target instanceof Element &&
        target.closest(".dropdown, select") !== null)
    );
  }

  /** Whether a running Mode holds any Segment at `indexes`, as it holds their menus. */
  function isAnyHeld(indexes: number[]): boolean {
    const view = session.transcript;
    return (
      view !== null && indexes.some((index) => isHeld("other", view, index))
    );
  }

  /**
   * Sends a change to the Segments at `indexes` for a key pressed, taking the key from the page; a
   * repeat or a press while a change is sent is dropped, as the Current Segment moves only once
   * the change shows, and so is one a running Mode holds.
   */
  async function changeByKey(
    event: KeyboardEvent,
    indexes: number[],
    send: () => Promise<Outcome>,
  ): Promise<void> {
    event.preventDefault();
    if (event.repeat || isChangingByKey || isAnyHeld(indexes)) return;
    isChangingByKey = true;
    try {
      notifyEdit(await send());
    } finally {
      isChangingByKey = false;
    }
  }

  /** The Checked Segments, or else the Current Segment, or none. */
  function indexesToDelete(): number[] {
    const checkedIndexes = session.checkedIndexes;
    if (checkedIndexes.length > 0) return checkedIndexes;
    const current = session.cursor.index;
    return current === null ? [] : [current];
  }

  /** Deletes the Checked Segments, or else the Current Segment, as one change; a key typed in a text field is the field's. */
  async function deleteByShortcut(event: KeyboardEvent): Promise<void> {
    if (
      isTextField(event.target) ||
      !isShortcut(event, "delete", isMacOS()) ||
      isWorkingElsewhere(event.target)
    )
      return;
    const indexes = indexesToDelete();
    if (indexes.length === 0) return;
    await changeByKey(event, indexes, () =>
      session.change({ kind: "deletion", indexes }),
    );
  }

  /** The neighbour the merge shortcut `event` presses merges with, or none for another key. */
  function mergeDirection(event: KeyboardEvent): MergeDirection | null {
    if (isShortcut(event, "mergeWithPrevious", isMacOS())) return "previous";
    if (isShortcut(event, "mergeWithNext", isMacOS())) return "next";
    return null;
  }

  /** Merges the Current Segment with the one before or after it, as the key pressed tells, a text field included, as a merge needs no Cursor. */
  async function mergeByShortcut(event: KeyboardEvent): Promise<void> {
    const direction = mergeDirection(event);
    const index = session.cursor.index;
    if (
      direction === null ||
      index === null ||
      isComposingKey(event) ||
      isWorkingElsewhere(event.target)
    )
      return;
    const count = session.transcript?.segments.length ?? 0;
    const run = runWithNeighbour(index, direction, count);
    if (run === null) return;
    await changeByKey(event, [run.first, run.last], () =>
      session.merge(run.first, run.last),
    );
  }

  /** Ctrl/⌘+A checks every Segment outside a text field; Ctrl/⌘+Shift+T cleans what is marked where no menu takes it first. */
  function checkOrClean(event: KeyboardEvent): void {
    if (
      isShortcut(event, "checkAll", isMacOS()) &&
      !isTextField(event.target)
    ) {
      event.preventDefault();
      session.checkAll();
    } else if (isShortcut(event, "cleanup", isMacOS())) {
      event.preventDefault();
      void cleanMarked(session);
    }
  }

  function followKeys(event: KeyboardEvent): void {
    checkOrClean(event);
    void deleteByShortcut(event);
    void mergeByShortcut(event);
  }

  /**
   * Select All selects the text in focus, or else checks every Segment; Clean Simplified Chinese
   * cleans what is marked.
   */
  function applyEditCommand({
    detail: command,
  }: CustomEvent<EditCommand>): void {
    if (command === "clean-simplified") void cleanMarked(session);
    if (command !== "select-all") return;
    if (isTextField(document.activeElement)) document.execCommand("selectAll");
    else session.checkAll();
  }

  /** Opens the search bar above the Segments. */
  export function openSearch(): void {
    searchBar.open();
  }
</script>

<svelte:window onkeydown={followKeys} onrust:edit-command={applyEditCommand} />

<SegmentRows
  {playback}
  {placeholders}
  {viewChoices}
  onshown={() => searchBar.searchAgain()}
>
  <div class="sticky -top-4 z-10 mb-2 flex flex-col gap-2">
    <SearchBar bind:this={searchBar} />
    <CheckedBar {project} />
  </div>
</SegmentRows>
