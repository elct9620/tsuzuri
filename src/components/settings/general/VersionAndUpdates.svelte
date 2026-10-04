<script lang="ts">
  import { onMount } from "svelte";

  import { appBuild } from "../../../backend/about";
  import { t } from "../../../i18n";
  import { notify, notifyFailure } from "../../../ui/notification";
  import HelpButton from "../HelpButton.svelte";

  /** How much of the commit is shown, as git abbreviates it. */
  const SHORT_COMMIT_LENGTH = 7;

  /** The App Build atop the general settings, for a report to name and copy. */
  let shownBuild = $state("");
  /** The App Build as a report names it, in any Interface Language. */
  let buildLine = "";

  onMount(async () => {
    const build = await appBuild();
    const commit = build.commit.slice(0, SHORT_COMMIT_LENGTH);
    shownBuild = t("settings.appBuild", {
      releaseName: build.release_name,
      commit,
    });
    buildLine = `Tsuzuri ${build.release_name} (${commit})`;
  });

  async function copyBuild(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildLine);
      notify({ title: t("settings.appBuildCopied"), kind: "success" });
    } catch (error) {
      notifyFailure(t("settings.appBuildNotCopied"), error);
    }
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
        <span data-i18n="settings.updates"></span>
        <HelpButton tip="settings.updatesHelp" />
      </span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-updates-target="checkButton"
          data-action="updates#check"
          data-i18n="settings.checkForUpdates"
        ></button>
        <span
          class="loading loading-spinner loading-sm"
          data-updates-target="checkingSpinner"
          hidden
        ></span>
        <span data-updates-target="status"></span>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-updates-target="updateButton"
          data-action="updates#install"
          data-i18n="settings.update"
          hidden
        ></button>
      </div>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.launchCheck"></span>
        <HelpButton tip="settings.launchCheckHelp" />
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-updates-target="launchCheckToggle"
        data-action="change->updates#chooseLaunchCheck"
      />
    </li>
    <li class="list-row items-center" data-updates-target="channelRow">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.updateChannel"></span>
        <HelpButton tip="settings.updateChannelHelp" />
      </span>
      <div class="flex items-center gap-2">
        <select
          class="select select-sm w-auto"
          data-updates-target="channelSelect"
          data-action="change->updates#chooseChannel"
        >
          <option value="stable" data-i18n="settings.channelStable"></option>
          <option value="preview" data-i18n="settings.channelPreview"></option>
        </select>
        <button
          type="button"
          class="btn btn-sm"
          data-updates-target="rollbackButton"
          data-action="updates#rollBack"
          data-i18n="settings.rollBack"
          hidden
        ></button>
      </div>
    </li>
  </ul>
</fieldset>
