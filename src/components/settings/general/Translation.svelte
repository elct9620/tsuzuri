<fieldset class="fieldset text-sm" data-controller="translation-settings">
  <legend class="fieldset-legend" data-i18n="settings.translation"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.batchSize"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.batchSizeHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        data-translation-settings-target="batchSize"
        data-action="change->translation-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.retries"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.retriesHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        data-translation-settings-target="retries"
        data-action="change->translation-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.referenceLines"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.referenceLinesHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        data-translation-settings-target="referenceLines"
        data-action="change->translation-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.residentLlama"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.residentLlamaHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-translation-settings-target="residentLlama"
        data-action="change->translation-settings#save"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.modelKeepSeconds"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.modelKeepSecondsHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <label class="input input-sm w-24">
        <input
          type="number"
          min="0"
          data-translation-settings-target="modelKeepSeconds"
          data-action="change->translation-settings#save"
        />
        <span data-i18n="settings.seconds"></span>
      </label>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.simplifiedCleaned"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.translationCleanedHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-translation-settings-target="simplifiedCleaned"
        data-action="change->translation-settings#save"
      />
    </li>
  </ul>
</fieldset>
