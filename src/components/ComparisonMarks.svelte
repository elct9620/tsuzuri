<!--
  @component
  What changed in a Comparison Row covering a Segment, as badges beside the text field its side
  compares, with the menu that takes the row back.
-->
<script lang="ts">
  import { t } from "../i18n";
  import { markLabels, type SideRow } from "./editor-comparison.svelte";
  import RevertMenu from "./RevertMenu.svelte";

  let { sideRow }: { sideRow: SideRow } = $props();
</script>

<div class="flex items-center gap-1" data-marks={sideRow.side}>
  {#each markLabels(sideRow.row) as label (label)}
    <span class="badge badge-warning badge-xs" data-mark>{t(label)}</span>
  {/each}
  <RevertMenu {sideRow} placement="dropdown-start" />
</div>
