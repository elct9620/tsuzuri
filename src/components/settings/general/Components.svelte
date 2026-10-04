<script lang="ts">
  import { onMount } from "svelte";

  import { open } from "../../../backend/dialog";
  import {
    chooseComponent,
    componentStatuses,
    forgetComponent,
    type ComponentStatus,
    type Origin,
  } from "../../../backend/toolchain";
  import { t } from "../../../i18n";
  import { notifyFailure } from "../../../ui/notification";
  import HelpButton from "../HelpButton.svelte";

  /** Each Component's row: its name as Rust knows it, as people know it, and its ⓘ. */
  const ROWS = [
    { name: "ffmpeg", label: "ffmpeg", tip: "settings.ffmpegHelp" },
    { name: "whisper", label: "whisper.cpp", tip: "settings.whisperHelp" },
    { name: "llama", label: "llama.cpp", tip: "settings.llamaHelp" },
  ];

  const ORIGIN_LABELS: Record<Origin, string> = {
    choice: "components.choice",
    detection: "components.detection",
    "bundled-variant": "components.bundled",
  };

  /** Every Component as Rust last found it, or null while it is still finding them. */
  let statuses = $state<ComponentStatus[] | null>(null);

  onMount(async () => {
    try {
      statuses = await componentStatuses();
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  });

  function statusByName(name: string): ComponentStatus | undefined {
    return statuses?.find((status) => status.name === name);
  }

  function statusMessage({
    is_ready,
    path,
    origin,
    variant,
    problem,
    install,
  }: ComponentStatus): string {
    if (is_ready && path)
      return t("components.found", {
        origin: variant
          ? t("components.bundledVariant", { variant })
          : t(origin ? ORIGIN_LABELS[origin] : "components.ready"),
        path,
      });
    if (problem === "does-not-run") return t("components.doesNotRun");
    return install
      ? t("components.installWith", { command: install })
      : t("components.install");
  }

  async function choosePath(name: string): Promise<void> {
    const path = await open({ multiple: false, directory: false });
    if (path === null) return;
    try {
      statuses = await chooseComponent(name, path);
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  async function restoreDefault(name: string): Promise<void> {
    try {
      statuses = await forgetComponent(name);
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.components")}</legend>
  <ul class="list rounded-box border border-base-300">
    {#each ROWS as { name, label, tip } (name)}
      {@const status = statusByName(name)}
      <li class="list-row items-center">
        <span class="flex w-32 items-center gap-1 font-medium">
          <span>{label}</span>
          <HelpButton {tip} />
        </span>
        {#if statuses === null}
          <span class="skeleton h-4 w-48"></span>
        {:else if status}
          <span class="break-all text-base-content/70"
            >{statusMessage(status)}</span
          >
        {/if}
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => choosePath(name)}>{t("settings.choose")}</button
        >
        {#if status?.origin === "choice"}
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            onclick={() => restoreDefault(name)}
            >{t("settings.restoreDefault")}</button
          >
        {/if}
      </li>
    {/each}
  </ul>
</fieldset>
