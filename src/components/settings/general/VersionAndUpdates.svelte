<script lang="ts">
  import HelpButton from "../HelpButton.svelte";
</script>

<fieldset class="fieldset text-sm" data-controller="about">
  <legend class="fieldset-legend" data-i18n="settings.versionAndUpdates"
  ></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.version"></span>
        <HelpButton tip="settings.versionHelp" />
      </span>
      <div class="flex items-center gap-2">
        <span data-about-target="build"></span>
        <button
          type="button"
          class="btn btn-sm"
          data-action="about#copyBuild"
          data-i18n="settings.copyAppBuild"
        ></button>
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
