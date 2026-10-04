<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend" data-i18n="settings.project"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.projectName"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.projectNameHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="text"
        class="input input-sm w-64"
        data-project-settings-target="nameField"
        data-action="change->project-settings#setOptions"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.primaryLanguage"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.primaryLanguageHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="language"
        data-action="change->project-settings#setLanguage"
      >
        <option value="zh-TW">繁體中文</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.bilingualOrder"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.bilingualOrderHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-auto"
        data-project-settings-target="bilingualOrder"
        data-action="change->project-settings#setOptions"
      >
        <option value="original-first" data-i18n="settings.originalFirst"
        ></option>
        <option value="translation-first" data-i18n="settings.translationFirst"
        ></option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.bilingualAutosave"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.bilingualAutosaveHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-project-settings-target="bilingualAutosave"
        data-action="change->project-settings#setOptions"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.overwriteBackup"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.overwriteBackupHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-project-settings-target="overwriteBackup"
        data-action="change->project-settings#setOptions"
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.diarizationAfterTranscription"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.diarizationAfterTranscriptionHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-project-settings-target="diarizationAfterTranscription"
        data-action="change->project-settings#setOptions"
      />
    </li>
  </ul>
</fieldset>
