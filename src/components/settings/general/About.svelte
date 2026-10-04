<fieldset class="fieldset text-sm" data-controller="licenses">
  <legend class="fieldset-legend" data-i18n="settings.about"></legend>
  <div class="flex flex-col gap-1 text-base-content/70">
    <p data-i18n="settings.license"></p>
    <p>
      This software uses code of FFmpeg licensed under the LGPLv2.1.
      Transcription uses whisper.cpp and translation uses llama.cpp, both under
      the MIT License. Each is bundled with Tsuzuri and runs as a separate
      program, which an executable you choose or have installed can replace.
    </p>
    <p>
      Cleaning Simplified Chinese uses the dictionaries of OpenCC
      (github.com/BYVoid/OpenCC) by BYVoid and contributors, under the Apache
      License 2.0, compiled into Tsuzuri as they are released.
    </p>
  </div>
  <div class="flex gap-2">
    <button
      type="button"
      class="btn btn-sm"
      data-action="licenses#showLicenses"
      data-i18n="settings.fullLicenses"
    ></button>
    <button
      type="button"
      class="btn btn-sm"
      data-action="licenses#openSource"
      data-i18n="settings.sourceCode"
    ></button>
    <button
      type="button"
      class="btn btn-sm"
      data-controller="sponsorship"
      data-action="sponsorship#open"
    >
      <i data-lucide="heart" class="size-4"></i>
      <span data-i18n="settings.sponsor"></span>
    </button>
  </div>
  <dialog class="modal" data-licenses-target="dialog">
    <div class="modal-box w-11/12 max-w-4xl">
      <h3 class="text-lg font-bold" data-i18n="settings.licenses"></h3>
      <iframe
        class="mt-4 h-[60vh] w-full rounded-box border border-base-300"
        title="LICENSE.html"
        sandbox=""
        data-licenses-target="notice"
        hidden
      ></iframe>
      <div
        role="alert"
        class="alert alert-info mt-4 text-sm"
        data-licenses-target="missingHint"
        data-i18n="settings.licensesMissing"
        hidden
      ></div>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn" data-i18n="work.close"></button>
        </form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
</fieldset>
