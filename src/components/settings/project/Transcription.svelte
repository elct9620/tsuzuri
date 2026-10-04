<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend" data-i18n="settings.transcription"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.vad"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.projectTranscriptionHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.projectTranscriptionHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.projectTranscriptionHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.projectTranscriptionHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
