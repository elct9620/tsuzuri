<script lang="ts">
  import { onMount } from "svelte";

  import { open } from "#/ipc/dialog.ts";
  import {
    chooseDebugLog,
    chooseLogDirectory,
    debugLog,
    logDirectory,
    openLogDirectory,
    type DebugLog,
    type LogDirectory,
  } from "#/ipc/logs.ts";
  import { t } from "#/i18n.ts";
  import { attempt } from "#/state/notification.svelte.ts";
  import SettingName from "#/components/settings/SettingName.svelte";

  /** Where the log is written in this launch and where after a restart, once read. */
  let directory = $state<LogDirectory | null>(null);
  /** Whether the Debug Log is written in this launch and after a restart, once read. */
  let debugLogStatus = $state<DebugLog | null>(null);
  /** The switch of the Debug Log, which stays as turned when recording it fails. */
  let isDebugLogChosen = $state(false);

  /** Says a directory chosen takes effect after a restart, while it differs from the one in use. */
  let directoryHint = $derived(
    directory && directory.next_launch !== directory.in_use
      ? t("settings.logsAfterRestart", { path: directory.next_launch })
      : null,
  );
  /** Says the Debug Log chosen takes effect after a restart, while it differs from this launch's. */
  let debugLogHint = $derived(
    debugLogStatus &&
      debugLogStatus.is_written_next_launch !== debugLogStatus.is_written_now
      ? t(
          debugLogStatus.is_written_next_launch
            ? "settings.debugLogOnAfterRestart"
            : "settings.debugLogOffAfterRestart",
        )
      : null,
  );

  onMount(async () => {
    await attempt(t("settings.logsUnreadable"), async () => {
      directory = await logDirectory();
      showDebugLog(await debugLog());
    });
  });

  function showDebugLog(answer: DebugLog): void {
    debugLogStatus = answer;
    isDebugLogChosen = answer.is_written_next_launch;
  }

  async function saveDebugLogChoice(): Promise<void> {
    await attempt(t("settings.debugLogNotChosen"), async () => {
      showDebugLog(await chooseDebugLog(isDebugLogChosen));
    });
  }

  async function chooseDirectory(): Promise<void> {
    const path = await open({ multiple: false, directory: true });
    if (path === null) return;
    await attempt(t("settings.logsNotChosen"), async () => {
      directory = await chooseLogDirectory(path);
    });
  }

  async function openDirectory(): Promise<void> {
    await attempt(t("settings.logsNotOpened"), async () => {
      await openLogDirectory();
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.logs")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <SettingName
        name={t("settings.logDirectory")}
        tip="settings.logDirectoryHelp"
      />
      <span
        class="list-col-grow truncate font-mono text-xs"
        title={directory?.in_use}>{directory?.in_use}</span
      >
      <button type="button" class="btn btn-sm" onclick={chooseDirectory}
        >{t("settings.chooseLogs")}</button
      >
      <button type="button" class="btn btn-sm" onclick={openDirectory}
        >{t("settings.openLogs")}</button
      >
    </li>
    <li class="list-row items-center">
      <SettingName name={t("settings.debugLog")} tip="settings.debugLogHelp" />
      <input
        type="checkbox"
        class="toggle"
        bind:checked={isDebugLogChosen}
        onchange={saveDebugLogChoice}
      />
    </li>
  </ul>
  {#if directoryHint !== null}
    <div role="alert" class="alert alert-info text-sm">{directoryHint}</div>
  {/if}
  {#if debugLogHint !== null}
    <div role="alert" class="alert alert-info text-sm">{debugLogHint}</div>
  {/if}
</fieldset>
