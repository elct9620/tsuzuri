<dialog
  class="modal"
  data-updates-target="dialog"
  data-action="cancel->updates#refuseClose"
>
  <div class="modal-box max-w-md">
    <h3 class="text-lg font-bold" data-updates-target="dialogTitle"></h3>
    <p class="mt-4 text-sm" data-updates-target="progressText"></p>
    <progress
      class="progress progress-primary mt-2 w-full"
      max="100"
      data-updates-target="progressBar"
    ></progress>
    <p
      class="mt-4 text-sm text-base-content/70"
      data-i18n="settings.updateRestartHint"
    ></p>
  </div>
</dialog>
