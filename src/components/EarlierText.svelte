<!--
  @component
  What a changed text read in the Backup compared, with the characters since removed struck out.
-->
<script lang="ts">
  import type { ComparedRow } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";

  let { row }: { row: ComparedRow } = $props();
</script>

<p class="px-1.5 text-xs text-base-content/60" data-earlier-text>
  {t("compare.wasPrefix")}{#if row.text_spans.length === 0}{row.left
      .map((cue) => cue.text)
      .join(" / ") ||
      "—"}{:else}{#each row.text_spans as span, index (index)}{#if span.kind === "common"}{span.text}{:else if span.kind === "removal"}<del
          class="text-error">{span.text}</del
        >{/if}{/each}{/if}
</p>
