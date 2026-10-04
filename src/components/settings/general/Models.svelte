<fieldset
  id="general-models"
  class="fieldset text-sm"
  data-controller="models"
  data-models-model-slot-outlet="#general-models [data-controller='model-slot']"
  data-action="model-slot:choose->models#chooseSource"
>
  <legend class="fieldset-legend" data-i18n="settings.models"></legend>
  <ul class="list rounded-box border border-base-300">
    <li
      class="list-row items-center"
      data-controller="model-slot"
      data-model-slot-slot-value="transcription"
      data-model-slot-repository-outlet="#repository-dialog"
      data-action="rust:model-download-progress@window->model-slot#showProgress"
    >
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="slots.transcription"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.transcriptionModelHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-full"
        data-model-slot-target="menu"
        data-action="model-slot#chooseFromMenu"
        data-i18n-label="slots.transcription"
      ></select>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-slot="transcription"
          data-action="models#choose"
          data-i18n="settings.chooseFile"
        ></button>
        <button
          type="button"
          class="btn btn-sm"
          data-action="model-slot#pickFromRepository"
          data-i18n="models.repository"
        ></button>
      </div>
      <span
        class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70 [&.missing]:text-error"
        data-model-slot-target="status"
        data-models-target="status"
        data-slot="transcription"
        data-i18n="models.notChosen"
      ></span>
      <div
        class="list-col-wrap col-[2/span_2] flex items-center gap-2"
        data-model-slot-target="download"
        hidden
      >
        <progress
          class="progress progress-primary w-full"
          max="100"
          data-model-slot-target="downloadBar"
        ></progress>
        <span
          class="text-xs whitespace-nowrap"
          data-model-slot-target="downloadLabel"
        ></span>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          data-action="model-slot#cancelDownload"
          data-i18n="models.cancelDownload"
        ></button>
      </div>
    </li>
    <li
      class="list-row items-center"
      data-controller="model-slot"
      data-model-slot-slot-value="vad"
      data-model-slot-repository-outlet="#repository-dialog"
      data-action="rust:model-download-progress@window->model-slot#showProgress"
    >
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="slots.vad"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.vadModelHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-full"
        data-model-slot-target="menu"
        data-action="model-slot#chooseFromMenu"
        data-i18n-label="slots.vad"
      ></select>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-slot="vad"
          data-action="models#choose"
          data-i18n="settings.chooseFile"
        ></button>
        <button
          type="button"
          class="btn btn-sm"
          data-action="model-slot#pickFromRepository"
          data-i18n="models.repository"
        ></button>
      </div>
      <span
        class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70 [&.missing]:text-error"
        data-model-slot-target="status"
        data-models-target="status"
        data-slot="vad"
        data-i18n="models.notChosen"
      ></span>
      <div
        class="list-col-wrap col-[2/span_2] flex items-center gap-2"
        data-model-slot-target="download"
        hidden
      >
        <progress
          class="progress progress-primary w-full"
          max="100"
          data-model-slot-target="downloadBar"
        ></progress>
        <span
          class="text-xs whitespace-nowrap"
          data-model-slot-target="downloadLabel"
        ></span>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          data-action="model-slot#cancelDownload"
          data-i18n="models.cancelDownload"
        ></button>
      </div>
    </li>
    <li
      class="list-row items-center"
      data-controller="model-slot"
      data-model-slot-slot-value="translation"
      data-model-slot-repository-outlet="#repository-dialog"
      data-action="rust:model-download-progress@window->model-slot#showProgress"
    >
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="slots.translation"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.translationModelHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-full"
        data-model-slot-target="menu"
        data-action="model-slot#chooseFromMenu"
        data-i18n-label="slots.translation"
      ></select>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-slot="translation"
          data-action="models#choose"
          data-i18n="settings.chooseFile"
        ></button>
        <button
          type="button"
          class="btn btn-sm"
          data-action="model-slot#pickFromRepository"
          data-i18n="models.repository"
        ></button>
      </div>
      <span
        class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70 [&.missing]:text-error"
        data-model-slot-target="status"
        data-models-target="status"
        data-slot="translation"
        data-i18n="models.notChosen"
      ></span>
      <div
        class="list-col-wrap col-[2/span_2] flex items-center gap-2"
        data-model-slot-target="download"
        hidden
      >
        <progress
          class="progress progress-primary w-full"
          max="100"
          data-model-slot-target="downloadBar"
        ></progress>
        <span
          class="text-xs whitespace-nowrap"
          data-model-slot-target="downloadLabel"
        ></span>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          data-action="model-slot#cancelDownload"
          data-i18n="models.cancelDownload"
        ></button>
      </div>
    </li>
    <li
      class="list-row items-center"
      data-controller="model-slot"
      data-model-slot-slot-value="diarization"
      data-model-slot-repository-outlet="#repository-dialog"
      data-action="rust:model-download-progress@window->model-slot#showProgress"
    >
      <span class="flex w-32 items-center gap-1 font-medium">
        <span data-i18n="slots.diarization"></span>
        <span
          tabindex="0"
          class="cursor-help text-base-content/50"
          data-i18n-tooltip="settings.diarizationModelHelp"
          ><i data-lucide="info" class="size-3.5"></i></span
        >
      </span>
      <select
        class="select select-sm w-full"
        data-model-slot-target="menu"
        data-action="model-slot#chooseFromMenu"
        data-i18n-label="slots.diarization"
      ></select>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-slot="diarization"
          data-action="models#choose"
          data-i18n="settings.chooseFile"
        ></button>
        <button
          type="button"
          class="btn btn-sm"
          data-action="model-slot#pickFromRepository"
          data-i18n="models.repository"
        ></button>
      </div>
      <span
        class="list-col-wrap col-[2/span_2] break-all text-xs text-base-content/70 [&.missing]:text-error"
        data-model-slot-target="status"
        data-models-target="status"
        data-slot="diarization"
        data-i18n="models.notChosen"
      ></span>
      <div
        class="list-col-wrap col-[2/span_2] flex items-center gap-2"
        data-model-slot-target="download"
        hidden
      >
        <progress
          class="progress progress-primary w-full"
          max="100"
          data-model-slot-target="downloadBar"
        ></progress>
        <span
          class="text-xs whitespace-nowrap"
          data-model-slot-target="downloadLabel"
        ></span>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          data-action="model-slot#cancelDownload"
          data-i18n="models.cancelDownload"
        ></button>
      </div>
    </li>
  </ul>
</fieldset>
