<!--
  @component
  The Segments of the Current Resource with the search and checked bars above them, and the
  shortcut and Edit menu command that clean Simplified Chinese out of what is marked.
-->
<script lang="ts">
  import type { EditCommand } from "../backend/project";
  import { isMacOS } from "../backend/system";
  import { isShortcut } from "../ui/shortcuts";
  import CheckedBar from "./CheckedBar.svelte";
  import { cleanMarked } from "./cleanup-actions";
  import { editingSession } from "./context";
  import type { PlaybackFollowing } from "./playback-following.svelte";
  import SearchBar from "./SearchBar.svelte";
  import SegmentRows from "./SegmentRows.svelte";

  let { following }: { following: PlaybackFollowing } = $props();
  const session = editingSession();
  let searchBar: SearchBar;
  let segmentRows: SegmentRows;

  /** Ctrl/⌘+Shift+T where no menu takes it first. */
  function cleanByShortcut(event: KeyboardEvent): void {
    if (!isShortcut(event, "cleanup", isMacOS())) return;
    event.preventDefault();
    void cleanMarked(session);
  }

  /** Clean Simplified Chinese chosen from the Edit menu. */
  function applyEditCommand({
    detail: command,
  }: CustomEvent<EditCommand>): void {
    if (command === "clean-simplified") void cleanMarked(session);
  }

  /** Opens the search bar above the Segments. */
  export function openSearch(): void {
    searchBar.open();
  }

  /** Stands Placeholders in for the Segments of a Resource being read. */
  export function showLoading(): void {
    segmentRows.showLoading();
  }
</script>

<svelte:window
  onkeydown={cleanByShortcut}
  onrust:edit-command={applyEditCommand}
/>

<SegmentRows {following} bind:this={segmentRows}>
  <div class="sticky -top-4 z-10 mb-2 flex flex-col gap-2">
    <SearchBar bind:this={searchBar} />
    <CheckedBar />
  </div>
</SegmentRows>
