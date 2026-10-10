<script lang="ts">
  import HelpButton from "#/components/settings/HelpButton.svelte";

  interface Props {
    /** The setting's name, as written in the Interface Language. */
    name: string;
    /** The key of the text explaining the setting. */
    tip: string;
  }

  let { name, tip }: Props = $props();
</script>

<!-- Wide enough for the longest English name on one line, so every row's control starts at one edge -->
<span class="flex w-60 items-center gap-1 font-medium">
  <span>{name}</span>
  <HelpButton {tip} />
</span>
