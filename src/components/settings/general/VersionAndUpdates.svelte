<script lang="ts">
  import ExternalLink from "@lucide/svelte/icons/external-link";

  import { onMount } from "svelte";

  import { appBuild, openReleases } from "#/ipc/about.ts";
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

  /** The running release's name, heading the version card. */
  let releaseName = $state("");
  /** The commit the App Build was made from, as git abbreviates it. */
  let shortCommit = $state("");
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
      releaseName = build.release_name;
      shortCommit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
      buildLine = `Tsuzuri ${releaseName} (${shortCommit})`;
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

  async function openReleaseNotes(): Promise<void> {
    await attempt(t("settings.releasesNotOpened"), async () => {
      await openReleases();
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
  <div class="card card-border bg-base-100">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex flex-col gap-1">
          <h3 class="card-title">
            <span>Tsuzuri {releaseName}</span>
            <span class="badge badge-sm badge-neutral"
              >{t(
                isPreviewBuild
                  ? "settings.channelPreview"
                  : "settings.channelStable",
              )}</span
            >
            <HelpButton tip="settings.versionHelp" />
          </h3>
          <div class="flex items-center gap-2">
            <span class="font-mono text-base-content/70">{shortCommit}</span>
            <button type="button" class="btn btn-xs" onclick={copyBuild}>
              {t("settings.copyAppBuild")}
            </button>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick={openReleaseNotes}>
          {t("settings.releaseNotes")}
          <ExternalLink class="size-4" aria-hidden="true" />
        </button>
      </div>
      <div
        class="flex flex-wrap items-center gap-2 border-t border-base-300 pt-3"
      >
        <span class="flex-1">{status}</span>
        <HelpButton tip="settings.updatesHelp" />
        {#if isChecking}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        <button
          type="button"
          class="btn btn-sm"
          disabled={isChecking}
          onclick={check}>{t("settings.checkForUpdates")}</button
        >
        {#if updates.foundUpdate}
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onclick={() => updates.install()}>{t("settings.update")}</button
          >
        {/if}
      </div>
    </div>
  </div>
  <ul class="list mt-2 rounded-box border border-base-300">
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
