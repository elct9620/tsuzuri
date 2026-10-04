<script lang="ts">
  import HelpButton from "../HelpButton.svelte";
</script>

<fieldset class="fieldset text-sm" data-controller="transcription-settings">
  <legend class="fieldset-legend" data-i18n="settings.transcription"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.vad"></span>
        <HelpButton tip="settings.vadHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-transcription-settings-target="vad"
        data-action="change->transcription-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.nonSpeechSuppressed"></span>
        <HelpButton tip="settings.nonSpeechSuppressedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-transcription-settings-target="nonSpeechSuppressed"
        data-action="change->transcription-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.contextCarried"></span>
        <HelpButton tip="settings.contextCarriedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-transcription-settings-target="contextCarried"
        data-action="change->transcription-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.simplifiedCleaned"></span>
        <HelpButton tip="settings.transcriptionCleanedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-transcription-settings-target="simplifiedCleaned"
        data-action="change->transcription-settings#save"
      />
    </li>
  </ul>
</fieldset>
