<fieldset class="fieldset text-sm" data-controller="logs">
  <legend class="fieldset-legend" data-i18n="settings.logs"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.logDirectory"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.logDirectoryHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <span
        class="list-col-grow truncate font-mono text-xs"
        data-logs-target="path"
      ></span>
      <button
        type="button"
        class="btn btn-sm"
        data-action="logs#choose"
        data-i18n="settings.chooseLogs"
      ></button>
      <button
        type="button"
        class="btn btn-sm"
        data-action="logs#openDirectory"
        data-i18n="settings.openLogs"
      ></button>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="settings.debugLog"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.debugLogHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <input
        type="checkbox"
        class="toggle"
        data-logs-target="debugLogToggle"
        data-action="change->logs#chooseDebugLog"
      />
    </li>
  </ul>
  <div
    role="alert"
    class="alert alert-info text-sm"
    data-logs-target="pendingHint"
    hidden
  ></div>
  <div
    role="alert"
    class="alert alert-info text-sm"
    data-logs-target="debugLogPendingHint"
    hidden
  ></div>
</fieldset>
