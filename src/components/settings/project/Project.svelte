<script lang="ts">
  import type { Language, ProjectOptions, ProjectView } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import SettingName from "#/components/settings/SettingName.svelte";
  import { saveOptions, setLanguage } from "#/actions/project-options.ts";

  interface Props {
    project: ProjectView;
  }

  let { project }: Props = $props();
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.project")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <SettingName
        name={t("settings.projectName")}
        tip="settings.projectNameHelp"
      />
      <input
        type="text"
        class="input input-sm w-64"
        value={project.options.name ?? ""}
        placeholder={project.directory_name}
        onchange={({ currentTarget }) =>
          saveOptions(project, { name: currentTarget.value || null })}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.primaryLanguage")}
        tip="settings.primaryLanguageHelp"
      />
      <select
        class="select select-sm w-auto"
        value={project.language}
        onchange={({ currentTarget }) =>
          setLanguage(currentTarget.value as Language)}
      >
        <option value="zh-TW" lang="zh-TW">繁體中文</option>
        <option value="en" lang="en">English</option>
        <option value="ja" lang="ja">日本語</option>
      </select>
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.bilingualOrder")}
        tip="settings.bilingualOrderHelp"
      />
      <select
        class="select select-sm w-auto"
        value={project.options.bilingual_order}
        onchange={({ currentTarget }) =>
          saveOptions(project, {
            bilingual_order:
              currentTarget.value as ProjectOptions["bilingual_order"],
          })}
      >
        <option value="original-first">{t("settings.originalFirst")}</option>
        <option value="translation-first"
          >{t("settings.translationFirst")}</option
        >
      </select>
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.bilingualAutosave")}
        tip="settings.bilingualAutosaveHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        checked={project.options.is_bilingual_autosaved}
        onchange={({ currentTarget }) =>
          saveOptions(project, {
            is_bilingual_autosaved: currentTarget.checked,
          })}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.overwriteBackup")}
        tip="settings.overwriteBackupHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        checked={project.options.is_overwrite_backed_up}
        onchange={({ currentTarget }) =>
          saveOptions(project, {
            is_overwrite_backed_up: currentTarget.checked,
          })}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.diarizationAfterTranscription")}
        tip="settings.diarizationAfterTranscriptionHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        checked={project.options.is_diarized_after_transcription}
        onchange={({ currentTarget }) =>
          saveOptions(project, {
            is_diarized_after_transcription: currentTarget.checked,
          })}
      />
    </li>
  </ul>
</fieldset>
