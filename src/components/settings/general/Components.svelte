<fieldset class="fieldset text-sm" data-controller="components">
  <legend class="fieldset-legend" data-i18n="settings.components"></legend>
  <ul class="list rounded-box border border-base-300">
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>ffmpeg</span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.ffmpegHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <span class="skeleton h-4 w-48" data-components-target="placeholder"
      ></span>
      <span
        class="break-all text-base-content/70"
        data-components-target="status"
        data-component="ffmpeg"
        hidden
      ></span>
      <button
        type="button"
        class="btn btn-sm"
        data-component="ffmpeg"
        data-action="components#choose"
        data-i18n="settings.choose"
      ></button>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        data-components-target="restoreButton"
        data-component="ffmpeg"
        data-action="components#restore"
        data-i18n="settings.restoreDefault"
        hidden
      ></button>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>whisper.cpp</span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.whisperHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <span class="skeleton h-4 w-48" data-components-target="placeholder"
      ></span>
      <span
        class="break-all text-base-content/70"
        data-components-target="status"
        data-component="whisper"
        hidden
      ></span>
      <button
        type="button"
        class="btn btn-sm"
        data-component="whisper"
        data-action="components#choose"
        data-i18n="settings.choose"
      ></button>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        data-components-target="restoreButton"
        data-component="whisper"
        data-action="components#restore"
        data-i18n="settings.restoreDefault"
        hidden
      ></button>
    </li>
    <li class="list-row items-center">
      <span class="flex w-32 items-center gap-1 font-medium">
        <span>llama.cpp</span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.llamaHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <span class="skeleton h-4 w-48" data-components-target="placeholder"
      ></span>
      <span
        class="break-all text-base-content/70"
        data-components-target="status"
        data-component="llama"
        hidden
      ></span>
      <button
        type="button"
        class="btn btn-sm"
        data-component="llama"
        data-action="components#choose"
        data-i18n="settings.choose"
      ></button>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        data-components-target="restoreButton"
        data-component="llama"
        data-action="components#restore"
        data-i18n="settings.restoreDefault"
        hidden
      ></button>
    </li>
  </ul>
</fieldset>
