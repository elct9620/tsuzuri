<script lang="ts">
  import CheckedBar from "./CheckedBar.svelte";
  import type { PlaybackFollowing } from "./playback-following.svelte";
  import SearchBar from "./SearchBar.svelte";
  import SegmentRows from "./SegmentRows.svelte";

  let { following }: { following: PlaybackFollowing } = $props();
  let searchBar: SearchBar;
  let segmentRows: SegmentRows;

  /** Opens the search bar above the Segments. */
  export function openSearch(): void {
    searchBar.open();
  }

  /** Stands Placeholders in for the Segments of a Resource being read. */
  export function showLoading(): void {
    segmentRows.showLoading();
  }
</script>

<SegmentRows {following} bind:this={segmentRows}>
  <div class="sticky -top-4 z-10 mb-2 flex flex-col gap-2">
    <SearchBar bind:this={searchBar} />
    <CheckedBar />
  </div>
</SegmentRows>
