<script lang="ts">
  import TranslationOptions from "./TranslationOptions.svelte";
</script>

<header class="navbar min-h-0 gap-2 bg-base-200 px-4 py-2">
  <label
    for="resources-drawer"
    class="btn btn-square btn-sm btn-ghost drawer-button lg:hidden"
    data-resource-list-target="overlayButton"
    data-i18n-label="resources.open"
    data-i18n-tooltip="resources.open"
    data-shortcut="resourceList"
  >
    <i data-lucide="menu" class="size-4"></i>
  </label>
  <button
    type="button"
    class="btn btn-square btn-sm btn-ghost hidden lg:inline-flex"
    data-resource-list-target="dockButton"
    data-action="resource-list#toggleDocked"
    data-i18n-label="resources.dock"
    data-i18n-tooltip="resources.dock"
    data-shortcut="resourceList"
  >
    <i data-lucide="panel-left" class="size-4"></i>
  </button>
  <h1 class="navbar-start w-auto min-w-0 flex-1">
    <label
      class="group input input-ghost input-sm w-full max-w-md hover:border-base-300"
      data-i18n-tooltip="toolbar.rename"
    >
      <input
        type="text"
        class="truncate text-base font-semibold"
        data-project-target="name"
        data-i18n-label="toolbar.projectName"
        data-action="change->project#rename keydown.enter->project#leaveName:!composing keydown.esc->project#discardName:!composing"
      />
      <i data-lucide="pencil" class="size-4 opacity-0 group-hover:opacity-60"
      ></i>
    </label>
  </h1>
  <div class="navbar-end w-auto shrink-0 gap-2">
    <div class="dropdown dropdown-end">
      <div
        tabindex="0"
        role="button"
        class="btn btn-sm"
        data-i18n-label="toolbar.open"
        data-i18n-tooltip="toolbar.open"
      >
        <i data-lucide="folder-open" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.open"
        ></span>
        <i data-lucide="chevron-down" class="size-4"></i>
      </div>
      <ul
        tabindex="-1"
        class="menu dropdown-content z-10 w-max min-w-40 max-w-80 rounded-box bg-base-100 shadow-md"
      >
        <li>
          <button
            type="button"
            data-action="project#openDirectory"
            data-i18n="toolbar.openDirectory"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-action="project#openSrt"
            data-i18n="toolbar.openSrt"
          ></button>
        </li>
        <li
          class="menu-title"
          data-recent-projects-target="menuTitle"
          data-i18n="start.recentProjects"
          hidden
        ></li>
      </ul>
    </div>

    <div
      class="contents"
      data-controller="transcribe"
      data-action="translation-options:overwrite->transcribe#followTranslation segment-changes:retranscribe@window->transcribe#openForScope"
      data-transcribe-progress-outlet="#progress"
      data-transcribe-translation-options-outlet="#transcribe-options"
    >
      <button
        type="button"
        class="btn btn-sm"
        data-transcribe-target="openButton"
        data-action="transcribe#open"
        data-i18n-label="toolbar.transcribe"
        data-i18n-tooltip="toolbar.transcribe"
        disabled
      >
        <i data-lucide="audio-lines" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.transcribe"
        ></span>
      </button>
      <dialog class="modal" data-transcribe-target="dialog">
        <div class="modal-box">
          <h3
            class="text-lg font-bold"
            data-transcribe-target="title"
            data-i18n="toolbar.transcribe"
          ></h3>
          <fieldset class="fieldset gap-3 text-sm">
            <p
              class="flex items-center gap-2"
              data-transcribe-target="scopeField"
              hidden
            >
              <span data-i18n="work.scope"></span>
              <span data-transcribe-target="scope"></span>
            </p>
            <p class="flex items-center gap-2">
              <span data-i18n="transcribe.language"></span>
              <span data-transcribe-target="language"></span>
            </p>
            <p class="flex items-center gap-2">
              <span data-i18n="transcribe.model"></span>
              <span
                class="break-all text-base-content/70"
                data-transcribe-target="model"
              ></span>
            </p>
            <label
              class="flex items-center gap-2"
              data-transcribe-target="diarizationChoice"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                data-transcribe-target="diarizationToggle"
              />
              <span data-i18n="transcribe.diarizeAfter"></span>
            </label>
            <label
              class="flex items-center gap-2"
              data-transcribe-target="translationChoice"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                data-transcribe-target="translationToggle"
                data-action="transcribe#showTranslationOptions"
              />
              <span data-i18n="transcribe.translateAfter"></span>
            </label>
            <fieldset
              id="transcribe-options"
              class="fieldset gap-3 rounded-box border border-base-300 px-4 pb-4"
              data-controller="translation-options"
              hidden
            >
              <legend class="fieldset-legend" data-i18n="toolbar.translate"
              ></legend>
              <TranslationOptions />
            </fieldset>
          </fieldset>
          <div
            role="alert"
            class="alert alert-warning mt-2"
            data-transcribe-target="overwriteWarning"
            hidden
          >
            <span data-transcribe-target="overwriteMessage"></span>
          </div>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn" data-i18n="work.cancel"></button>
            </form>
            <button
              type="button"
              class="btn btn-primary"
              data-transcribe-target="startButton"
              data-action="transcribe#start"
              data-i18n="transcribe.start"
            ></button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>

    <div
      class="contents"
      data-controller="translate"
      data-action="translation-options:overwrite->translate#showOverwrite segment-changes:retranslate@window->translate#openForSegments"
      data-translate-progress-outlet="#progress"
      data-translate-translation-options-outlet="#translate-options"
    >
      <button
        type="button"
        class="btn btn-sm"
        data-translate-target="openButton"
        data-action="translate#open"
        data-i18n-label="toolbar.translate"
        data-i18n-tooltip="toolbar.translate"
        disabled
      >
        <i data-lucide="languages" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.translate"
        ></span>
      </button>
      <dialog class="modal" data-translate-target="dialog">
        <div class="modal-box">
          <h3
            class="text-lg font-bold"
            data-translate-target="title"
            data-i18n="toolbar.translate"
          ></h3>
          <fieldset class="fieldset gap-3 text-sm">
            <p
              class="flex items-center gap-2"
              data-translate-target="scopeField"
              hidden
            >
              <span data-i18n="work.scope"></span>
              <span data-translate-target="scope"></span>
            </p>
            <p class="flex flex-wrap items-center gap-2">
              <span data-i18n="translate.source"></span>
              <span data-translate-target="source"></span>
            </p>
            <div
              id="translate-options"
              class="contents"
              data-controller="translation-options"
            >
              <TranslationOptions />
            </div>
          </fieldset>
          <div
            role="alert"
            class="alert alert-warning mt-2"
            data-translate-target="overwriteWarning"
            hidden
          >
            <span data-i18n="translate.overwrite"></span>
          </div>
          <div
            role="alert"
            class="alert alert-info mt-2"
            data-translate-target="continuationHint"
            hidden
          >
            <span data-i18n="translate.continuation"></span>
          </div>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn" data-i18n="work.cancel"></button>
            </form>
            <button
              type="button"
              class="btn btn-primary"
              data-translate-target="startButton"
              data-action="translate#start"
              data-i18n="translate.start"
            ></button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>

    <div
      class="contents"
      data-controller="diarize"
      data-diarize-progress-outlet="#progress"
    >
      <button
        type="button"
        class="btn btn-sm"
        data-diarize-target="openButton"
        data-action="diarize#open"
        data-i18n-label="toolbar.diarize"
        data-i18n-tooltip="toolbar.diarize"
        disabled
      >
        <i data-lucide="users" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.diarize"
        ></span>
      </button>
      <dialog class="modal" data-diarize-target="dialog">
        <div class="modal-box">
          <h3 class="text-lg font-bold" data-i18n="diarize.title"></h3>
          <fieldset class="fieldset gap-3 text-sm">
            <p class="flex flex-wrap items-center gap-2">
              <span data-i18n="diarize.model"></span>
              <span class="break-all" data-diarize-target="model"></span>
            </p>
          </fieldset>
          <div
            role="alert"
            class="alert alert-warning mt-2"
            data-diarize-target="overwriteWarning"
            hidden
          >
            <span data-i18n="diarize.overwrite"></span>
          </div>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn" data-i18n="work.cancel"></button>
            </form>
            <button
              type="button"
              class="btn btn-primary"
              data-diarize-target="startButton"
              data-action="diarize#start"
              data-i18n="diarize.start"
            ></button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>

    <div class="dropdown dropdown-end">
      <div
        tabindex="0"
        role="button"
        class="btn btn-sm"
        data-i18n-label="toolbar.export"
        data-i18n-tooltip="toolbar.export"
      >
        <i data-lucide="download" class="size-4"></i><span
          class="hidden @5xl:inline"
          data-i18n="toolbar.export"
        ></span>
        <i data-lucide="chevron-down" class="size-4"></i>
      </div>
      <ul
        tabindex="-1"
        class="menu dropdown-content z-10 w-52 rounded-box bg-base-100 shadow-md"
      >
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="bilingual"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.bilingual"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="original"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.original"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="translation"
            data-transcript-format-param="srt"
            disabled
            data-i18n="toolbar.translation"
          ></button>
        </li>
        <li></li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="bilingual"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.bilingualText"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="original"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.originalText"
          ></button>
        </li>
        <li>
          <button
            type="button"
            data-transcript-target="exportButton"
            data-action="transcript#save"
            data-transcript-content-param="translation"
            data-transcript-format-param="plain_text"
            disabled
            data-i18n="toolbar.translationText"
          ></button>
        </li>
        <li>
          <label class="justify-between">
            <span data-i18n="toolbar.textSpeakers"></span>
            <input
              type="checkbox"
              class="toggle toggle-sm"
              data-transcript-target="textSpeakerToggle"
              data-action="transcript#rememberTextSpeakers"
            />
          </label>
        </li>
        <li>
          <label class="justify-between">
            <span data-i18n="toolbar.textBlankLines"></span>
            <input
              type="checkbox"
              class="toggle toggle-sm"
              data-transcript-target="textBlankLineToggle"
              data-action="transcript#rememberTextBlankLines"
            />
          </label>
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="btn btn-sm btn-ghost"
      data-action="dialog#open"
      data-i18n-label="toolbar.settings"
      data-i18n-tooltip="toolbar.settings"
    >
      <i data-lucide="settings" class="size-4"></i><span
        class="hidden @5xl:inline"
        data-i18n="toolbar.settings"
      ></span>
    </button>
    <button
      type="button"
      class="btn btn-square btn-sm btn-ghost"
      data-action="shortcuts#open"
      data-i18n-label="shortcuts.title"
      data-i18n-tooltip="shortcuts.title"
      data-shortcut="list"
    >
      <i data-lucide="keyboard" class="size-4"></i>
    </button>
  </div>
</header>
