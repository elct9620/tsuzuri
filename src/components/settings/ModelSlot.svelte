<script lang="ts">
  import { onMount } from "svelte";

  import { open } from "../../backend/dialog";
  import {
    cancelModelDownload,
    downloadModel,
    modelSettings,
    presetModels,
    type DownloadProgress,
    type ModelSlot,
    type ModelSource,
    type PresetModel,
  } from "../../backend/toolchain";
  import { t } from "../../i18n";
  import {
    presetLabel,
    sizeLabel,
    sourceFileName,
    type HubFile,
  } from "../../ui/models";
  import { notifyFailure } from "../../ui/notification.svelte";
  import HelpButton from "./HelpButton.svelte";

  interface Props {
    slot: ModelSlot;
    /** Chooses for the Project, falling back to the general setting, rather than for every Project. */
    isProjectSlot?: boolean;
    /** The slot's Model, or none chosen. */
    source: ModelSource | null;
    /** Which of the slot's Preset Models `source` is, as Rust names it. */
    presetIndex: number | null;
    /** Where the slot's Model is, or why it is not there. */
    status: string;
    /** Whether the slot's Model is chosen but its file is not there. */
    isMissing?: boolean;
    /** Opens the Repository dialog for the slot, answering the file picked, or none. */
    pick: (slot: ModelSlot) => Promise<HubFile | null>;
    /** Records the Model Source chosen, or none to follow the general settings. The Model is chosen only once downloaded. */
    onchoose: (source: ModelSource | null) => void;
  }

  let {
    slot,
    isProjectSlot = false,
    source,
    presetIndex,
    status,
    isMissing = false,
    pick,
    onchoose,
  }: Props = $props();

  /** Menu value of the slot's own Model, one no Preset Model is. */
  const OWN_MODEL = "own";
  /** Menu value of following the general settings, which only a Project's slot offers. */
  const GENERAL_MODEL = "general";

  let presets = $state<PresetModel[]>([]);
  /** The Preset Models by name, each with its place in `presets`. */
  let presetGroups = $derived.by(() => {
    const groups = new Map<string, { preset: PresetModel; index: number }[]>();
    presets.forEach((preset, index) => {
      const group = groups.get(preset.name) ?? [];
      group.push({ preset, index });
      groups.set(preset.name, group);
    });
    return groups;
  });
  /** The menu value of the slot's Model, the first option when none is chosen. */
  let modelChoice = $derived(
    presetIndex !== null
      ? String(presetIndex)
      : source !== null
        ? OWN_MODEL
        : isProjectSlot
          ? GENERAL_MODEL
          : "",
  );
  /** The menu's value, the slot's Model until the user picks another. */
  let menuChoice = $derived(modelChoice);
  let pendingDownload = $state<HubFile | null>(null);
  /** How far the download has come, in percent, or unknown. */
  let downloadPercent = $state<number | null>(null);
  let downloadLabel = $state("");

  onMount(async () => {
    try {
      presets = await presetModels(slot);
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  /** Picks a Model file by the extensions Rust names for the slot; none is offered while they cannot be read. */
  async function chooseFile(): Promise<void> {
    const settings = await modelSettings().catch(() => null);
    if (settings === null) return;
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Model", extensions: settings[slot].extensions }],
    });
    if (path !== null) onchoose({ kind: "file", path });
  }

  async function chooseFromMenu({
    currentTarget,
  }: Event & { currentTarget: HTMLSelectElement }): Promise<void> {
    menuChoice = currentTarget.value;
    if (menuChoice === GENERAL_MODEL) {
      onchoose(null);
      return;
    }
    const preset = presets[Number(menuChoice)];
    if (preset?.source.kind !== "repository") return;
    const { repo, file, commit } = preset.source;
    await download({ repo, file }, commit);
  }

  async function pickFromRepository(): Promise<void> {
    const hubFile = await pick(slot);
    if (hubFile !== null) await download(hubFile, null);
  }

  function showProgress({ detail }: CustomEvent<DownloadProgress>): void {
    if (pendingDownload?.repo !== detail.repo) return;
    if (pendingDownload.file !== detail.file) return;
    if (detail.total === null) {
      downloadPercent = null;
      downloadLabel = sizeLabel(detail.downloaded);
      return;
    }
    downloadPercent = Math.floor((detail.downloaded * 100) / detail.total);
    downloadLabel = `${downloadPercent}%`;
  }

  async function cancelDownload(): Promise<void> {
    if (pendingDownload !== null)
      await cancelModelDownload(pendingDownload.repo, pendingDownload.file);
  }

  /** Downloads `target` at `revision`, the main branch when none, and chooses it once it is there. */
  async function download(
    target: HubFile,
    revision: string | null,
  ): Promise<void> {
    pendingDownload = target;
    downloadPercent = null;
    downloadLabel = "";
    try {
      onchoose(await downloadModel(target.repo, target.file, revision));
    } catch (error) {
      notifyFailure(t("models.notDownloaded"), error);
      menuChoice = modelChoice;
    } finally {
      pendingDownload = null;
    }
  }
</script>

<svelte:window onrust:model-download-progress={showProgress} />

<li class="list-row items-center">
  <span class="flex w-32 items-center gap-1 font-medium">
    <span>{t(`slots.${slot}`)}</span>
    <HelpButton
      tip={isProjectSlot
        ? "settings.projectModelHelp"
        : `settings.${slot}ModelHelp`}
    />
  </span>
  <select
    class="select select-sm w-full"
    aria-label={t(`slots.${slot}`)}
    disabled={pendingDownload !== null}
    value={menuChoice}
    onchange={chooseFromMenu}
  >
    {#if isProjectSlot}
      <option value={GENERAL_MODEL}>{t("models.followsGeneral")}</option>
    {:else}
      <option value="" disabled>{t("models.notChosen")}</option>
    {/if}
    {#if source !== null && presetIndex === null}
      <option value={OWN_MODEL} disabled
        >{t("models.own", { name: sourceFileName(source) })}</option
      >
    {/if}
    {#each presetGroups as [name, group] (name)}
      <optgroup label={name}>
        {#each group as { preset, index } (index)}
          <option value={String(index)}>{presetLabel(preset)}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  <div class="flex gap-2">
    <button type="button" class="btn btn-sm" onclick={chooseFile}
      >{t("settings.chooseFile")}</button
    >
    <button type="button" class="btn btn-sm" onclick={pickFromRepository}
      >{t("models.repository")}</button
    >
  </div>
  {#if pendingDownload === null}
    <span
      class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70"
      class:text-error={isMissing}>{status}</span
    >
  {:else}
    <div class="list-col-wrap col-[2/span_2] flex items-center gap-2">
      <progress
        class="progress progress-primary w-full"
        max="100"
        value={downloadPercent}
      ></progress>
      <span class="text-xs whitespace-nowrap">{downloadLabel}</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        onclick={cancelDownload}>{t("models.cancelDownload")}</button
      >
    </div>
  {/if}
</li>
