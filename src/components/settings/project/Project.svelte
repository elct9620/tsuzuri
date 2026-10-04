<script lang="ts">
  import HelpButton from "../HelpButton.svelte";
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend" data-i18n="settings.project"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.projectName"></span>
        <HelpButton tip="settings.projectNameHelp" />
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
        <HelpButton tip="settings.primaryLanguageHelp" />
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
        <HelpButton tip="settings.bilingualOrderHelp" />
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
        <HelpButton tip="settings.bilingualAutosaveHelp" />
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
        <HelpButton tip="settings.overwriteBackupHelp" />
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
        <HelpButton tip="settings.diarizationAfterTranscriptionHelp" />
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
