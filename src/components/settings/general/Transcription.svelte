<script lang="ts">
  import { onMount } from "svelte";

  import {
    saveTranscriptionSettings,
    transcriptionSettings,
    type TranscriptionSettings,
  } from "#/ipc/transcription.ts";
  import { t } from "#/i18n.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import SettingName from "#/components/settings/SettingName.svelte";

  /** The general Transcription Settings, the default of every Project, as the switches stand. */
  let settings = $state<TranscriptionSettings>({
    has_vad: false,
    is_non_speech_suppressed: false,
    is_context_carried: false,
    is_simplified_cleaned: false,
  });

  onMount(async () => {
    await attempt(t("settings.unreadable"), async () => {
      settings = await transcriptionSettings();
    });
  });

  async function save(): Promise<void> {
    await attempt(t("settings.notSaved"), async () => {
      settings = await saveTranscriptionSettings($state.snapshot(settings));
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.transcription")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <SettingName name={t("settings.vad")} tip="settings.vadHelp" />
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.has_vad}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.nonSpeechSuppressed")}
        tip="settings.nonSpeechSuppressedHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_non_speech_suppressed}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.contextCarried")}
        tip="settings.contextCarriedHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_context_carried}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <SettingName
        name={t("settings.simplifiedCleaned")}
        tip="settings.transcriptionCleanedHelp"
      />
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_simplified_cleaned}
        onchange={save}
      />
    </li>
  </ul>
</fieldset>
