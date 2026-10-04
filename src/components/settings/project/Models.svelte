<script lang="ts">
  import ModelSlot from "../ModelSlot.svelte";
</script>

<fieldset
  id="project-models"
  class="fieldset text-sm"
  data-action="model-slot:choose->project-settings#chooseSource"
>
  <legend class="fieldset-legend" data-i18n="settings.models"></legend>
  <ul class="list rounded-box border border-base-300">
    <ModelSlot slot="transcription" isProjectSlot />
    <ModelSlot slot="translation" isProjectSlot />
  </ul>
</fieldset>
