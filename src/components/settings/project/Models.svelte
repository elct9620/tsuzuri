<script lang="ts">
  import type { ProjectModels, ProjectView } from "#/ipc/project.ts";
  import type { ModelSlot as Slot, ModelSource } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import { sourceName, type HubFile } from "#/ui/models.ts";
  import ModelSlot from "#/components/settings/ModelSlot.svelte";
  import { saveOptions } from "#/actions/project-options.ts";

  interface Props {
    project: ProjectView;
    /** Opens the Repository dialog for a slot, answering the file picked, or none. */
    pick: (slot: Slot) => Promise<HubFile | null>;
  }

  let { project, pick }: Props = $props();

  const SLOTS: (keyof ProjectModels)[] = ["transcription", "translation"];

  /** Sets `source` as the slot's Project Model, or none to follow the general settings. */
  async function record(
    slot: keyof ProjectModels,
    source: ModelSource | null,
  ): Promise<void> {
    await saveOptions(project, {
      models: { ...project.options.models, [slot]: source },
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.models")}</legend>
  <ul class="list rounded-box border border-base-300">
    {#each SLOTS as slot (slot)}
      {@const source = project.options.models[slot]}
      <ModelSlot
        {slot}
        isProjectSlot
        {source}
        presetIndex={project.project_model_presets[slot]}
        status={source === null
          ? t("models.followsGeneral")
          : sourceName(source)}
        {pick}
        onchoose={(chosen) => record(slot, chosen)}
      />
    {/each}
  </ul>
</fieldset>
