<!--
  @component
  The take-back menu of a Comparison Row in the editor: the whole row, and for a Pair its text or
  its times alone where they changed, each taken back from its side's Backup.
-->
<script lang="ts">
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  import type { RevertPart } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { closeMenu } from "#/ui/menu.ts";
  import { editorComparison } from "#/components/context.ts";
  import type { SideRow } from "#/components/editor-comparison.svelte.ts";

  let {
    sideRow,
    placement,
  }: {
    sideRow: SideRow;
    placement: "dropdown-start" | "dropdown-end";
  } = $props();

  const comparison = editorComparison();

  const parts = $derived.by(() => {
    const { row } = sideRow;
    const offeredParts: [RevertPart, string][] = [
      ["whole", "compare.revertWhole"],
    ];
    if (row.kind === "pair" && row.is_text_changed)
      offeredParts.push(["text", "compare.revertText"]);
    if (row.kind === "pair" && row.is_time_changed)
      offeredParts.push(["times", "compare.revertTimes"]);
    return offeredParts;
  });
</script>

<div class={["dropdown", placement]}>
  <div
    tabindex="0"
    role="button"
    class="btn btn-square btn-ghost btn-xs"
    title={t("compare.revert")}
    aria-label={t("compare.revert")}
  >
    <RotateCcw class="size-4" aria-hidden="true" />
  </div>
  <ul
    tabindex="-1"
    class="menu dropdown-content z-10 w-40 rounded-box bg-base-100 shadow-md"
  >
    {#each parts as [part, label] (part)}
      <li>
        <button
          type="button"
          class="revert-{part}"
          onclick={({ currentTarget }) => {
            closeMenu(currentTarget);
            void comparison.revert(sideRow, part);
          }}>{t(label)}</button
        >
      </li>
    {/each}
  </ul>
</div>
