<script lang="ts">
  import { onMount } from "svelte";

  import { appBuild } from "#/ipc/about.ts";
  import {
    checkForRollback,
    checkForUpdate,
    checkForUpdateAtLaunch,
    chooseLaunchCheck,
    chooseUpdateChannel,
    updateSettings,
    type UpdateChannel,
    type UpdateSettings,
  } from "#/ipc/updates.ts";
  import { t } from "#/i18n.ts";
  import { attempt, notify } from "#/state/notification.svelte.ts";
  import { updateFoundMessage } from "#/state/app-updates.svelte.ts";
  import { appUpdates } from "#/state/context.ts";
  import HelpButton from "#/components/settings/HelpButton.svelte";

  /** How much of the commit is shown, as git abbreviates it. */
  const SHORT_COMMIT_LENGTH = 7;

  const updates = appUpdates();

  /** The App Build atop the general settings, for a report to name and copy. */
  let shownBuild = $state("");
  /** The App Build as a report names it, in any Interface Language. */
  let buildLine = "";
  /** Whether the running Tsuzuri is a Preview build, the only one a Rollback leads back from. */
  let isPreviewBuild = $state(false);
  /** Whether this install has the Update Channel setting, which an rpm install does not. */
  let hasPreviewChannel = $state(true);
  let settings = $state<UpdateSettings | null>(null);
  let isChecking = $state(false);
  let isRollingBack = $state(false);

  /** Says whether the running release is the latest, or names the App Update found. */
  const status = $derived(
    updates.foundUpdate
      ? updateFoundMessage(updates.foundUpdate)
      : updates.hasChecked
        ? t("settings.latestRelease")
        : "",
  );

  onMount(async () => {
    await attempt(t("settings.updateNotChecked"), async () => {
      const build = await appBuild();
      const commit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
      shownBuild = t("settings.appBuild", {
        releaseName: build.release_name,
        commit,
      });
      buildLine = `Tsuzuri ${build.release_name} (${commit})`;
      isPreviewBuild = build.is_preview_build;
      hasPreviewChannel = build.has_preview_channel;
      settings = await updateSettings();
      updates.offer(await checkForUpdateAtLaunch());
    });
  });

  async function copyBuild(): Promise<void> {
    await attempt(t("settings.appBuildNotCopied"), async () => {
      await navigator.clipboard.writeText(buildLine);
      notify({ title: t("settings.appBuildCopied"), kind: "success" });
    });
  }

  async function check(): Promise<void> {
    isChecking = true;
    await attempt(t("settings.updateNotChecked"), async () => {
      updates.show(await checkForUpdate());
    });
    isChecking = false;
  }

  async function rollBack(): Promise<void> {
    isRollingBack = true;
    await attempt(t("settings.updateNotChecked"), async () => {
      updates.show(await checkForRollback());
      await updates.install();
    });
    isRollingBack = false;
  }

  async function saveLaunchCheck(hasLaunchCheck: boolean): Promise<void> {
    await attempt(t("settings.launchCheckNotChosen"), async () => {
      settings = await chooseLaunchCheck(hasLaunchCheck);
    });
  }

  async function saveChannel(channel: UpdateChannel): Promise<void> {
    await attempt(t("settings.updateChannelNotChosen"), async () => {
      settings = await chooseUpdateChannel(channel);
    });
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.versionAndUpdates")}</legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.version")}</span>
        <HelpButton tip="settings.versionHelp" />
      </span>
      <div class="flex items-center gap-2">
        <span>{shownBuild}</span>
        <button type="button" class="btn btn-sm" onclick={copyBuild}>
          {t("settings.copyAppBuild")}
        </button>
      </div>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.updates")}</span>
        <HelpButton tip="settings.updatesHelp" />
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-sm"
          disabled={isChecking}
          onclick={check}>{t("settings.checkForUpdates")}</button
        >
        {#if isChecking}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        <span>{status}</span>
        {#if updates.foundUpdate}
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={() => updates.install()}>{t("settings.update")}</button
          >
        {/if}
      </div>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>{t("settings.launchCheck")}</span>
        <HelpButton tip="settings.launchCheckHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        checked={settings?.has_launch_check ?? false}
        onchange={({ currentTarget }) => saveLaunchCheck(currentTarget.checked)}
      />
    </li>
    {#if hasPreviewChannel}
      <li class="list-row items-center">
        <span class="flex w-32 items-center gap-1 font-medium">
          <span>{t("settings.updateChannel")}</span>
          <HelpButton tip="settings.updateChannelHelp" />
        </span>
        <div class="flex items-center gap-2">
          <select
            class="select select-sm w-auto"
            value={settings?.channel ?? "stable"}
            onchange={({ currentTarget }) =>
              saveChannel(currentTarget.value as UpdateChannel)}
          >
            <option value="stable">{t("settings.channelStable")}</option>
            <option value="preview">{t("settings.channelPreview")}</option>
          </select>
          {#if isPreviewBuild && settings?.channel === "stable"}
            <button
              type="button"
              class="btn btn-sm"
              disabled={isRollingBack}
              onclick={rollBack}>{t("settings.rollBack")}</button
            >
          {/if}
        </div>
      </li>
    {/if}
  </ul>
</fieldset>
