<script lang="ts">
  import ModelSlot from "../ModelSlot.svelte";
</script>

<fieldset
  id="general-models"
  class="fieldset text-sm"
  data-controller="models"
  data-models-model-slot-outlet="#general-models [data-controller='model-slot']"
  data-action="model-slot:choose->models#chooseSource"
>
  <legend class="fieldset-legend" data-i18n="settings.models"></legend>
  <ul class="list rounded-box border border-base-300">
    <ModelSlot slot="transcription" />
    <ModelSlot slot="vad" />
    <ModelSlot slot="translation" />
    <ModelSlot slot="diarization" />
  </ul>
</fieldset>
