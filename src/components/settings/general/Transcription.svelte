<script lang="ts">
  import { onMount } from "svelte";

  import {
    saveTranscriptionSettings,
    transcriptionSettings,
    type TranscriptionSettings,
  } from "#/ipc/transcription.ts";
  import { t } from "#/i18n.ts";
  import { notifyFailure } from "#/ui/notification.svelte.ts";
  import HelpButton from "#/components/settings/HelpButton.svelte";

  /** The general Transcription Settings, the default of every Project, as the switches stand. */
  let settings = $state<TranscriptionSettings>({
    has_vad: false,
    is_non_speech_suppressed: false,
    is_context_carried: false,
    is_simplified_cleaned: false,
  });

  onMount(async () => {
    try {
      settings = await transcriptionSettings();
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  async function save(): Promise<void> {
    try {
      settings = await saveTranscriptionSettings($state.snapshot(settings));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.transcription")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.vad")}</span>
        <HelpButton tip="settings.vadHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.has_vad}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.nonSpeechSuppressed")}</span>
        <HelpButton tip="settings.nonSpeechSuppressedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_non_speech_suppressed}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.contextCarried")}</span>
        <HelpButton tip="settings.contextCarriedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_context_carried}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.simplifiedCleaned")}</span>
        <HelpButton tip="settings.transcriptionCleanedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={settings.is_simplified_cleaned}
        onchange={save}
      />
    </li>
  </ul>
</fieldset>
