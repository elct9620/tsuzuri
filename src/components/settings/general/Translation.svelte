<script lang="ts">
  import { onMount } from "svelte";

  import {
    saveTranslationSettings,
    translationSettings,
    type TranslationSettings,
  } from "../../../backend/translation";
  import { t } from "../../../i18n";
  import { notifyFailure } from "../../../ui/notification";
  import HelpButton from "../HelpButton.svelte";

  /** The general translation settings as the fields stand; a number field left empty is null. */
  let fields = $state({
    batch_size: null as number | null,
    retries: null as number | null,
    reference_lines: null as number | null,
    has_resident_llama: false,
    model_keep_seconds: null as number | null,
    is_simplified_cleaned: false,
  });
  /** The Model is only kept by the Resident llama-server, as last saved. */
  let isModelKeepOffered = $state(true);

  onMount(async () => {
    try {
      show(await translationSettings());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  async function save(): Promise<void> {
    const settings: TranslationSettings = {
      ...fields,
      batch_size: Number(fields.batch_size),
      retries: Number(fields.retries),
      reference_lines: Number(fields.reference_lines),
      model_keep_seconds: Number(fields.model_keep_seconds),
    };
    try {
      show(await saveTranslationSettings(settings));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  function show(settings: TranslationSettings): void {
    fields = { ...settings };
    isModelKeepOffered = settings.has_resident_llama;
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.translation")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.batchSize")}</span>
        <HelpButton tip="settings.batchSizeHelp" />
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        bind:value={fields.batch_size}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.retries")}</span>
        <HelpButton tip="settings.retriesHelp" />
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        bind:value={fields.retries}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.referenceLines")}</span>
        <HelpButton tip="settings.referenceLinesHelp" />
      </span>
      <input
        type="number"
        min="1"
        class="input input-sm w-24"
        bind:value={fields.reference_lines}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.residentLlama")}</span>
        <HelpButton tip="settings.residentLlamaHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={fields.has_resident_llama}
        onchange={save}
      />
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.modelKeepSeconds")}</span>
        <HelpButton tip="settings.modelKeepSecondsHelp" />
      </span>
      <label class="input input-sm w-24">
        <input
          type="number"
          min="0"
          disabled={!isModelKeepOffered}
          bind:value={fields.model_keep_seconds}
          onchange={save}
        />
        <span>{t("settings.seconds")}</span>
      </label>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.simplifiedCleaned")}</span>
        <HelpButton tip="settings.translationCleanedHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        bind:checked={fields.is_simplified_cleaned}
        onchange={save}
      />
    </li>
  </ul>
</fieldset>
