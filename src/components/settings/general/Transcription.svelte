<fieldset class="fieldset text-sm" data-controller="transcription-settings">
  <legend class="fieldset-legend" data-i18n="settings.transcription"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.vad"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.vadHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.nonSpeechSuppressedHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.contextCarriedHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.transcriptionCleanedHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
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
