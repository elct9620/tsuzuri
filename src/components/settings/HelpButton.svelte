<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import type { ClassValue } from "svelte/elements";

  import { t } from "#/i18n.ts";

  interface Props {
    /** The key of the text explaining the setting, shown as the tooltip and read as the name. */
    tip: string;
    /** The colour of the ⓘ, for a row that already sets one for its text. */
    class?: ClassValue;
  }

  let { tip, class: tone = "text-base-content/50" }: Props = $props();
</script>

<button
  type="button"
  class={["cursor-help", tone]}
  aria-label={t(tip)}
  data-tooltip={t(tip)}><Info class="size-3.5" /></button
>
