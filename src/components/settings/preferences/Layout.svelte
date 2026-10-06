<!--
  @component
  The Preferences tab's Layout: which arrangement of the editor's regions is on trial, applied as it
  is chosen.
-->
<script lang="ts">
  import { t } from "#/i18n.ts";
  import { LAYOUTS, type LayoutChoice } from "#/state/layout-choice.svelte.ts";

  let { layoutChoice }: { layoutChoice: LayoutChoice } = $props();

  function choose(value: string): void {
    const chosen = LAYOUTS.find((layout) => layout === value);
    if (chosen) layoutChoice.choose(chosen);
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("preferences.layout")}</legend>
  <select
    class="select"
    aria-label={t("preferences.layout")}
    value={layoutChoice.layout}
    onchange={({ currentTarget }) => choose(currentTarget.value)}
  >
    {#each LAYOUTS as layout (layout)}
      <option value={layout}>{t(`preferences.layouts.${layout}`)}</option>
    {/each}
  </select>
  <p class="label">{t("preferences.layoutHint")}</p>
</fieldset>
