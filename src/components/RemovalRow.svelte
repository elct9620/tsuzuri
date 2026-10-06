<!--
  @component
  A cue its side's Backup has and the subtitle no longer does, standing among the Segments where
  it was, with the menu that takes it back.
-->
<script lang="ts">
  import { t } from "#/i18n.ts";
  import { formatTime } from "#/ui/time.ts";
  import { editorComparison } from "#/components/context.ts";
  import type { SideRow } from "#/components/editor-comparison.svelte.ts";
  import RevertMenu from "#/components/RevertMenu.svelte";

  let { sideRow }: { sideRow: SideRow } = $props();

  const comparison = editorComparison();
</script>

<li
  class="border border-dashed border-base-300 text-base-content/60"
  data-ghost={sideRow.side}
>
  <span class="badge badge-warning badge-xs" data-mark
    >{t("compare.removedMark")}</span
  >
  <time>{formatTime(sideRow.row.left[0].start_ms)}</time>
  <p class="list-col-grow text-sm">
    {t("compare.removedFrom", {
      source: comparison.sideName(sideRow.side),
      text: sideRow.row.left.map((cue) => cue.text).join(" / "),
    })}
  </p>
  <RevertMenu {sideRow} placement="dropdown-end" />
</li>
