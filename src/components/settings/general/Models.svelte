<script lang="ts">
  import { onMount } from "svelte";

  import {
    chooseModel,
    modelSettings,
    type ModelSettingsView,
    type ModelSlot as Slot,
    type ModelSource,
  } from "../../../backend/toolchain";
  import { t } from "../../../i18n";
  import { sourceName, type HubFile } from "../../../ui/models";
  import { notifyFailure } from "../../../ui/notification";
  import ModelSlot from "../ModelSlot.svelte";

  interface Props {
    /** Opens the Repository dialog for a slot, answering the file picked, or none. */
    pick: (slot: Slot) => Promise<HubFile | null>;
  }

  let { pick }: Props = $props();

  const SLOTS: Slot[] = ["transcription", "vad", "translation", "diarization"];

  /** Each slot's Model as Rust holds it, once read. */
  let settings = $state<ModelSettingsView | null>(null);

  onMount(async () => {
    try {
      settings = await modelSettings();
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  /** Where the slot's Model is, or why it is not there. */
  function status(slot: Slot): string {
    if (settings === null) return t("models.notChosen");
    const { source, path, has_file } = settings[slot];
    if (source === null || path === null) return t("models.notChosen");
    if (has_file) return path;
    return source.kind === "repository"
      ? t("models.downloadAgain", { name: sourceName(source) })
      : t("models.missing", { path });
  }

  async function record(slot: Slot, source: ModelSource | null): Promise<void> {
    if (source === null) return;
    try {
      settings = await chooseModel(slot, source);
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.models")}</legend>
  <ul class="list rounded-box border border-base-300">
    {#each SLOTS as slot (slot)}
      <ModelSlot
        {slot}
        source={settings?.[slot].source ?? null}
        presetIndex={settings?.[slot].preset_index ?? null}
        status={status(slot)}
        isMissing={settings !== null &&
          settings[slot].path !== null &&
          !settings[slot].has_file}
        {pick}
        onchoose={(source) => record(slot, source)}
      />
    {/each}
  </ul>
</fieldset>
