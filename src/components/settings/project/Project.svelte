<script lang="ts">
  import type { ProjectOptions, ProjectView } from "../../../backend/project";
  import { t } from "../../../i18n";
  import HelpButton from "../HelpButton.svelte";
  import { saveOptions, setLanguage } from "./project-options";

  interface Props {
    project: ProjectView;
  }

  let { project }: Props = $props();
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.project")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.projectName")}</span>
        <HelpButton tip="settings.projectNameHelp" />
      </span>
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
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.primaryLanguage")}</span>
        <HelpButton tip="settings.primaryLanguageHelp" />
      </span>
      <select
        class="select select-sm w-auto"
        value={project.language}
        onchange={({ currentTarget }) => setLanguage(currentTarget.value)}
      >
        <option value="zh-TW">繁體中文</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.bilingualOrder")}</span>
        <HelpButton tip="settings.bilingualOrderHelp" />
      </span>
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
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.bilingualAutosave")}</span>
        <HelpButton tip="settings.bilingualAutosaveHelp" />
      </span>
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
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.overwriteBackup")}</span>
        <HelpButton tip="settings.overwriteBackupHelp" />
      </span>
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
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.diarizationAfterTranscription")}</span>
        <HelpButton tip="settings.diarizationAfterTranscriptionHelp" />
      </span>
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
