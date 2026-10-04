<script lang="ts">
  import type {
    ProjectView,
    TranscriptionOverrides,
  } from "../../../backend/project";
  import { t } from "../../../i18n";
  import HelpButton from "../HelpButton.svelte";
  import { saveOptions } from "./project_options";

  interface Props {
    project: ProjectView;
  }

  let { project }: Props = $props();

  /** Each Transcription Setting the Project can set, by the name of its label. */
  const SETTINGS: [keyof TranscriptionOverrides, string][] = [
    ["has_vad", "settings.vad"],
    ["is_non_speech_suppressed", "settings.nonSpeechSuppressed"],
    ["is_context_carried", "settings.contextCarried"],
    ["is_simplified_cleaned", "settings.simplifiedCleaned"],
  ];

  /** The menu value of an override: following the general settings, `on` or `off`. */
  function overrideChoice(value: boolean | null): string {
    return value === null ? "" : value ? "on" : "off";
  }

  async function saveOverride(
    setting: keyof TranscriptionOverrides,
    choice: string,
  ): Promise<void> {
    await saveOptions(project, {
      transcription: {
        ...project.options.transcription,
        [setting]: choice === "" ? null : choice === "on",
      },
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.transcription")}</legend>
  <ul class="list rounded-box border border-base-300">
    {#each SETTINGS as [setting, label] (setting)}
      <li class="list-row items-center">
        <span class="flex w-32 items-center gap-1 font-medium">
          <span>{t(label)}</span>
          <HelpButton tip="settings.projectTranscriptionHelp" />
        </span>
        <select
          class="select select-sm w-auto"
          value={overrideChoice(project.options.transcription[setting])}
          onchange={({ currentTarget }) =>
            saveOverride(setting, currentTarget.value)}
        >
          <option value="">{t("settings.followGeneral")}</option>
          <option value="on">{t("settings.on")}</option>
          <option value="off">{t("settings.off")}</option>
        </select>
      </li>
    {/each}
  </ul>
</fieldset>
