<script lang="ts">
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
    <div
      class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
      data-segment-changes-target="checkedBar"
      hidden
    >
      <span data-segment-changes-target="checkedCount"></span>
      <button
        type="button"
        class="btn btn-xs"
        data-segment-changes-target="mergeButton"
        data-action="segment-changes#merge"
        data-i18n="edit.merge"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-action="segment-changes#openShift"
        data-i18n="edit.shift"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-action="segment-changes#openSpeakers"
        data-i18n="edit.speakersOfChecked"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-segment-changes-target="retranslateButton"
        data-action="segment-changes#retranslate"
        data-i18n="edit.retranslate"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-segment-changes-target="retranscribeButton"
        data-action="segment-changes#retranscribe"
        data-i18n="edit.retranscribe"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-cleanup-target="checkedButton"
        data-action="cleanup#cleanChecked"
        data-i18n="cleanup.action"
        data-shortcut="cleanup"
      ></button>
      <button
        type="button"
        class="btn btn-xs"
        data-action="segment-changes#deleteChecked"
        data-i18n="edit.delete"
        data-shortcut="delete"
      ></button>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        data-action="segment-changes#clearChecks"
        data-i18n="edit.clearChecks"
      ></button>
    </div>
  </div>
</SegmentRows>
