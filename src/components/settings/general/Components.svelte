<script lang="ts">
  import { onMount } from "svelte";

  import { open } from "#/ipc/dialog.ts";
  import {
    chooseComponent,
    componentStatuses,
    forgetComponent,
    type ComponentStatus,
    type Origin,
  } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import { attempt, notify } from "#/state/notification.svelte.ts";
  import { fileName } from "#/ui/file-name.ts";
  import HelpButton from "#/components/settings/HelpButton.svelte";

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
    await attempt(t("settings.unreadable"), async () => {
      statuses = await componentStatuses();
    });
  });

  function statusByName(name: string): ComponentStatus | undefined {
    return statuses?.find((status) => status.name === name);
  }

  /** The status badge's text and colour: ready, or why not. */
  function statusBadge({ is_ready, problem }: ComponentStatus): {
    label: string;
    colour: string;
  } {
    if (is_ready) return { label: "components.ready", colour: "badge-success" };
    if (problem === "does-not-run")
      return { label: "components.notRunning", colour: "badge-error" };
    return { label: "components.missing", colour: "badge-warning" };
  }

  /** Where the executable came from, or none while it is not ready. */
  function sourceLabel({ is_ready, origin, variant }: ComponentStatus): string {
    if (!is_ready || origin === null) return "—";
    return variant
      ? t("components.bundledVariant", { variant })
      : t(ORIGIN_LABELS[origin]);
  }

  /** The directory part of `path`, which is cut short first so the file name stays whole. */
  function directoryOf(path: string): string {
    return path.slice(0, path.length - fileName(path).length);
  }

  async function copyInstall(command: string): Promise<void> {
    await attempt(t("components.installNotCopied"), async () => {
      await navigator.clipboard.writeText(command);
      notify({ title: t("components.installCopied"), kind: "success" });
    });
  }

  async function choosePath(name: string): Promise<void> {
    const path = await open({ multiple: false, directory: false });
    if (path === null) return;
    await attempt(t("settings.notSaved"), async () => {
      statuses = await chooseComponent(name, path);
    });
  }

  async function restoreDefault(name: string): Promise<void> {
    await attempt(t("settings.notSaved"), async () => {
      statuses = await forgetComponent(name);
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.components")}</legend>
  <div class="overflow-x-auto rounded-box border border-base-300">
    <table class="table table-sm">
      <thead>
        <tr>
          <th>{t("components.component")}</th>
          <th>{t("components.status")}</th>
          <th>{t("components.source")}</th>
          <th>{t("components.path")}</th>
          <th><span class="sr-only">{t("components.actions")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each ROWS as { name, label, tip } (name)}
          {@const status = statusByName(name)}
          <tr>
            <th>
              <span class="flex items-center gap-1 whitespace-nowrap">
                <span>{label}</span>
                <HelpButton {tip} />
              </span>
            </th>
            {#if statuses === null}
              <td colspan="3"><span class="skeleton block h-4 w-48"></span></td>
            {:else if status}
              {@const badge = statusBadge(status)}
              <td>
                <span class={["badge badge-sm whitespace-nowrap", badge.colour]}
                  >{t(badge.label)}</span
                >
              </td>
              <td class="whitespace-nowrap">{sourceLabel(status)}</td>
              <td class="w-full max-w-0">
                {#if status.path}
                  <span class="sr-only">{status.path}</span>
                  <span
                    class="flex min-w-0 font-mono text-xs"
                    aria-hidden="true"
                    data-tooltip={status.path}
                    ><span class="truncate">{directoryOf(status.path)}</span
                    ><span class="shrink-0">{fileName(status.path)}</span></span
                  >
                {:else}
                  —
                {/if}
              </td>
            {:else}
              <td colspan="3"></td>
            {/if}
            <td>
              <span class="flex justify-end gap-2">
                <button
                  type="button"
                  class="btn btn-sm"
                  onclick={() => choosePath(name)}
                  >{t("settings.choose")}</button
                >
                {#if status?.origin === "choice"}
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost"
                    onclick={() => restoreDefault(name)}
                    >{t("settings.restoreDefault")}</button
                  >
                {/if}
              </span>
            </td>
          </tr>
          {#if status && !status.is_ready}
            <tr>
              <td></td>
              <td colspan="4">
                {#if status.problem === "does-not-run"}
                  {t("components.doesNotRun")}
                {:else if status.install}
                  <span class="flex flex-wrap items-center gap-2">
                    <span>{t("components.installWith")}</span>
                    <code class="font-mono">{status.install}</code>
                    <button
                      type="button"
                      class="btn btn-xs"
                      onclick={() => copyInstall(status.install!)}
                      >{t("components.copyInstall")}</button
                    >
                  </span>
                {:else}
                  {t("components.install")}
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</fieldset>
