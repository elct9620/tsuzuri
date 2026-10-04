<script lang="ts">
  import HelpButton from "../HelpButton.svelte";
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend" data-i18n="settings.transcription"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.vad"></span>
        <HelpButton tip="settings.projectTranscriptionHelp" />
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="transcriptionSetting"
        data-setting="has_vad"
        data-action="change->project-settings#setOptions"
      >
        <option value="" data-i18n="settings.followGeneral"></option>
        <option value="on" data-i18n="settings.on"></option>
        <option value="off" data-i18n="settings.off"></option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.nonSpeechSuppressed"></span>
        <HelpButton tip="settings.projectTranscriptionHelp" />
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="transcriptionSetting"
        data-setting="is_non_speech_suppressed"
        data-action="change->project-settings#setOptions"
      >
        <option value="" data-i18n="settings.followGeneral"></option>
        <option value="on" data-i18n="settings.on"></option>
        <option value="off" data-i18n="settings.off"></option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.contextCarried"></span>
        <HelpButton tip="settings.projectTranscriptionHelp" />
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="transcriptionSetting"
        data-setting="is_context_carried"
        data-action="change->project-settings#setOptions"
      >
        <option value="" data-i18n="settings.followGeneral"></option>
        <option value="on" data-i18n="settings.on"></option>
        <option value="off" data-i18n="settings.off"></option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.simplifiedCleaned"></span>
        <HelpButton tip="settings.projectTranscriptionHelp" />
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="transcriptionSetting"
        data-setting="is_simplified_cleaned"
        data-action="change->project-settings#setOptions"
      >
        <option value="" data-i18n="settings.followGeneral"></option>
        <option value="on" data-i18n="settings.on"></option>
        <option value="off" data-i18n="settings.off"></option>
      </select>
    </li>
  </ul>
</fieldset>
