<script>
  import EditorBar from "./components/EditorBar.svelte";
  import Notifications from "./components/Notifications.svelte";
  import Preview from "./components/Preview.svelte";
  import ResourceList from "./components/ResourceList.svelte";
  import SegmentList from "./components/SegmentList.svelte";
  import ShortcutsDialog from "./components/ShortcutsDialog.svelte";
  import StartScreen from "./components/StartScreen.svelte";
  import TranslationOptions from "./components/TranslationOptions.svelte";
  import UpdatesDialog from "./components/UpdatesDialog.svelte";
</script>

<main
  class="flex h-dvh flex-col"
  data-controller="project recent-projects transcript segment-changes dialog comparison speakers replacement cleanup search"
  data-comparison-versions-outlet="[data-controller~=versions]"
  data-action="progress:task->transcript#followTask selectionchange@document->transcript#followSelection pointerup@window->transcript#releasePointer editor:cursor@window->transcript#showCursor editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked keydown.ctrl+a@window->segment-changes#checkAll:!typing:prevent keydown.meta+a@window->segment-changes#checkAll:!typing:prevent keydown@window->segment-changes#deleteByShortcut:!typing keydown@window->segment-changes#mergeByShortcut preview:playing->transcript#markPlaying project:select->transcript#showLoading transcript:shown->comparison#mark transcript:shown->speakers#follow segment-changes:speakers->speakers#openForChecked transcript:shown->segment-changes#followTasks versions:compare-with->comparison#compareWith keydown.ctrl+r@window->project#reload:prevent keydown.meta+r@window->project#reload:prevent keydown.ctrl+l@window->transcript#toggleFollowing:prevent keydown.meta+l@window->transcript#toggleFollowing:prevent keydown@window->replacement#openByShortcut keydown@window->search#openByShortcut keydown@window->search#moveByShortcut transcript:shown->search#follow keydown.ctrl+shift+t@window->cleanup#cleanByShortcut:prevent keydown.meta+shift+t@window->cleanup#cleanByShortcut:prevent rust:edit-command@window->cleanup#applyEditCommand transcript:shown->cleanup#follow rust:edit-command@window->segment-changes#applyEditCommand rust:changed-elsewhere-kept@window->project#notifyChangedElsewhereKept rust:srt-requested@window->project#openRequestedSrt"
>
  <StartScreen />

  <div
    class="drawer h-dvh lg:data-is-docked:drawer-open"
    data-project-target="workspace"
    data-controller="resource-list"
    data-action="system:orientation@window->resource-list#follow keydown@window->resource-list#toggleByShortcut project:select@window->resource-list#putAway"
    hidden
  >
    <input
      id="resources-drawer"
      type="checkbox"
      class="drawer-toggle"
      data-resource-list-target="toggle"
    />
    <div class="drawer-content @container flex h-dvh min-w-0 flex-col">
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
            <i
              data-lucide="pencil"
              class="size-4 opacity-0 group-hover:opacity-60"
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
                    <legend
                      class="fieldset-legend"
                      data-i18n="toolbar.translate"
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
      <div
        class="contents"
        data-controller="preview timeline"
        data-action="editor:cursor@window->timeline#showCursor system:color-scheme@window->timeline#repaintWaveform editor:cursor@window->preview#showCursor rust:video-window-closing@window->preview#closeVideoWindow editor:choice@window->timeline#moveToChoice preferences:saved@window->timeline#readPreferences keydown.space@window->timeline#playOrStop:!control:prevent keydown@window->timeline#setTimeAtMedia:!control keydown.esc@window->timeline#cancel:!control keydown.enter@window->timeline#insertRange:!control focusin@window->timeline#followFocus pointerdown@window->timeline#followModifiers:capture pointermove@window->timeline#followModifiers:capture pointermove@window->timeline#extendDrawing pointerup@window->timeline#finishDrawing"
      >
        <EditorBar />
        <Preview />
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <SegmentList />
      </div>
    </div>
    <ResourceList />
  </div>

  <dialog class="modal" data-dialog-target="dialog">
    <div class="modal-box max-w-3xl">
      <h3 class="mb-2 text-lg font-bold" data-i18n="toolbar.settings"></h3>
      <div
        role="tablist"
        class="tabs tabs-border"
        data-controller="project-settings"
        data-project-settings-model-slot-outlet="#project-models [data-controller='model-slot']"
      >
        <input
          type="radio"
          name="settings-tabs"
          class="tab"
          data-i18n-label="settings.project"
          data-project-settings-target="projectTab settings"
          checked
        />
        <div class="tab-content pt-4" data-project-settings-target="settings">
          <div class="flex flex-col gap-4">
            <fieldset class="fieldset text-sm">
              <legend class="fieldset-legend" data-i18n="settings.project"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.projectName"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectNameHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="text"
                    class="input input-sm w-64"
                    data-project-settings-target="nameField"
                    data-action="change->project-settings#setOptions"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.primaryLanguage"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.primaryLanguageHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="language"
                    data-action="change->project-settings#setLanguage"
                  >
                    <option value="zh-TW">繁體中文</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.bilingualOrder"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.bilingualOrderHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="bilingualOrder"
                    data-action="change->project-settings#setOptions"
                  >
                    <option
                      value="original-first"
                      data-i18n="settings.originalFirst"
                    ></option>
                    <option
                      value="translation-first"
                      data-i18n="settings.translationFirst"
                    ></option>
                  </select>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.bilingualAutosave"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.bilingualAutosaveHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-project-settings-target="bilingualAutosave"
                    data-action="change->project-settings#setOptions"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.overwriteBackup"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.overwriteBackupHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-project-settings-target="overwriteBackup"
                    data-action="change->project-settings#setOptions"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.diarizationAfterTranscription"
                    ></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.diarizationAfterTranscriptionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-project-settings-target="diarizationAfterTranscription"
                    data-action="change->project-settings#setOptions"
                  />
                </li>
              </ul>
            </fieldset>
            <fieldset class="fieldset text-sm">
              <legend class="fieldset-legend" data-i18n="settings.transcription"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.vad"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectTranscriptionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="transcriptionSetting"
                    data-setting="has_vad"
                    data-action="change->project-settings#setOptions"
                  >
                    <option value="" data-i18n="settings.followGeneral"
                    ></option>
                    <option value="on" data-i18n="settings.on"></option>
                    <option value="off" data-i18n="settings.off"></option>
                  </select>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.nonSpeechSuppressed"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectTranscriptionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="transcriptionSetting"
                    data-setting="is_non_speech_suppressed"
                    data-action="change->project-settings#setOptions"
                  >
                    <option value="" data-i18n="settings.followGeneral"
                    ></option>
                    <option value="on" data-i18n="settings.on"></option>
                    <option value="off" data-i18n="settings.off"></option>
                  </select>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.contextCarried"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectTranscriptionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="transcriptionSetting"
                    data-setting="is_context_carried"
                    data-action="change->project-settings#setOptions"
                  >
                    <option value="" data-i18n="settings.followGeneral"
                    ></option>
                    <option value="on" data-i18n="settings.on"></option>
                    <option value="off" data-i18n="settings.off"></option>
                  </select>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.simplifiedCleaned"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectTranscriptionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <select
                    class="select select-sm w-auto"
                    data-project-settings-target="transcriptionSetting"
                    data-setting="is_simplified_cleaned"
                    data-action="change->project-settings#setOptions"
                  >
                    <option value="" data-i18n="settings.followGeneral"
                    ></option>
                    <option value="on" data-i18n="settings.on"></option>
                    <option value="off" data-i18n="settings.off"></option>
                  </select>
                </li>
              </ul>
            </fieldset>
            <fieldset
              id="project-models"
              class="fieldset text-sm"
              data-action="model-slot:choose->project-settings#chooseSource"
            >
              <legend class="fieldset-legend" data-i18n="settings.models"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li
                  class="list-row items-center"
                  data-controller="model-slot"
                  data-model-slot-slot-value="transcription"
                  data-model-slot-is-project-slot-value="true"
                  data-model-slot-repository-outlet="#repository-dialog"
                  data-action="rust:model-download-progress@window->model-slot#showProgress"
                >
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="slots.transcription"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectModelHelp"
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
                      data-action="project-settings#chooseModel"
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
                    data-project-settings-target="projectModel"
                    data-slot="transcription"
                    data-i18n="models.followsGeneral"
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
                  data-model-slot-is-project-slot-value="true"
                  data-model-slot-repository-outlet="#repository-dialog"
                  data-action="rust:model-download-progress@window->model-slot#showProgress"
                >
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="slots.translation"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.projectModelHelp"
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
                      data-action="project-settings#chooseModel"
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
                    data-project-settings-target="projectModel"
                    data-slot="translation"
                    data-i18n="models.followsGeneral"
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
          </div>
        </div>
        <input
          type="radio"
          name="settings-tabs"
          class="tab"
          data-i18n-label="settings.general"
          data-project-settings-target="generalTab"
        />
        <div class="tab-content pt-4">
          <div class="flex flex-col gap-4">
            <fieldset class="fieldset text-sm" data-controller="about">
              <legend
                class="fieldset-legend"
                data-i18n="settings.versionAndUpdates"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.version"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.versionHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
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
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.updatesHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
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
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.launchCheckHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-updates-target="launchCheckToggle"
                    data-action="change->updates#chooseLaunchCheck"
                  />
                </li>
                <li
                  class="list-row items-center"
                  data-updates-target="channelRow"
                >
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.updateChannel"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.updateChannelHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <div class="flex items-center gap-2">
                    <select
                      class="select select-sm w-auto"
                      data-updates-target="channelSelect"
                      data-action="change->updates#chooseChannel"
                    >
                      <option value="stable" data-i18n="settings.channelStable"
                      ></option>
                      <option
                        value="preview"
                        data-i18n="settings.channelPreview"
                      ></option>
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

            <fieldset class="fieldset text-sm" data-controller="components">
              <legend class="fieldset-legend" data-i18n="settings.components"
              ></legend>
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
                  <span
                    class="skeleton h-4 w-48"
                    data-components-target="placeholder"
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
                  <span
                    class="skeleton h-4 w-48"
                    data-components-target="placeholder"
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
                  <span
                    class="skeleton h-4 w-48"
                    data-components-target="placeholder"
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

            <fieldset
              class="fieldset text-sm"
              data-controller="translation-settings"
            >
              <legend class="fieldset-legend" data-i18n="settings.translation"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.batchSize"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.batchSizeHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="number"
                    min="1"
                    class="input input-sm w-24"
                    data-translation-settings-target="batchSize"
                    data-action="change->translation-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.retries"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.retriesHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="number"
                    min="1"
                    class="input input-sm w-24"
                    data-translation-settings-target="retries"
                    data-action="change->translation-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.referenceLines"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.referenceLinesHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="number"
                    min="1"
                    class="input input-sm w-24"
                    data-translation-settings-target="referenceLines"
                    data-action="change->translation-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.residentLlama"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.residentLlamaHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-translation-settings-target="residentLlama"
                    data-action="change->translation-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.modelKeepSeconds"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.modelKeepSecondsHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <label class="input input-sm w-24">
                    <input
                      type="number"
                      min="0"
                      data-translation-settings-target="modelKeepSeconds"
                      data-action="change->translation-settings#save"
                    />
                    <span data-i18n="settings.seconds"></span>
                  </label>
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.simplifiedCleaned"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.translationCleanedHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-translation-settings-target="simplifiedCleaned"
                    data-action="change->translation-settings#save"
                  />
                </li>
              </ul>
            </fieldset>

            <fieldset
              class="fieldset text-sm"
              data-controller="transcription-settings"
            >
              <legend class="fieldset-legend" data-i18n="settings.transcription"
              ></legend>
              <ul class="list rounded-box border border-base-300">
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.vad"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.vadHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-transcription-settings-target="vad"
                    data-action="change->transcription-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.nonSpeechSuppressed"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.nonSpeechSuppressedHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-transcription-settings-target="nonSpeechSuppressed"
                    data-action="change->transcription-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.contextCarried"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.contextCarriedHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-transcription-settings-target="contextCarried"
                    data-action="change->transcription-settings#save"
                  />
                </li>
                <li class="list-row items-center">
                  <span class="flex w-32 items-center gap-1 font-medium">
                    <span data-i18n="settings.simplifiedCleaned"></span>
                    <span
                      tabindex="0"
                      class="cursor-help text-base-content/50"
                      data-i18n-tooltip="settings.transcriptionCleanedHelp"
                      ><i data-lucide="info" class="size-3.5"></i></span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle"
                    data-transcription-settings-target="simplifiedCleaned"
                    data-action="change->transcription-settings#save"
                  />
                </li>
              </ul>
            </fieldset>

            <fieldset
              id="general-models"
              class="fieldset text-sm"
              data-controller="models"
              data-models-model-slot-outlet="#general-models [data-controller='model-slot']"
              data-action="model-slot:choose->models#chooseSource"
            >
              <legend class="fieldset-legend" data-i18n="settings.models"
              ></legend>
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
            <dialog
              id="repository-dialog"
              class="modal"
              data-controller="repository"
              data-repository-target="dialog"
              data-action="close->repository#settle"
            >
              <div class="modal-box">
                <h3
                  class="text-lg font-bold"
                  data-repository-target="title"
                ></h3>
                <fieldset class="fieldset gap-3 text-sm">
                  <p class="label" data-i18n="repository.nameHint"></p>
                  <div class="join w-full">
                    <input
                      type="text"
                      class="input join-item w-full"
                      placeholder="owner/name"
                      spellcheck="false"
                      data-repository-target="repo"
                      data-action="keydown.enter->repository#list:prevent"
                    />
                    <button
                      type="button"
                      class="btn join-item"
                      data-action="repository#list"
                      data-i18n="repository.list"
                    ></button>
                  </div>
                  <div
                    class="list max-h-72 overflow-y-auto rounded-box border border-base-300"
                    data-repository-target="files"
                    data-action="change->repository#chooseFile"
                    hidden
                  ></div>
                  <div
                    role="alert"
                    class="alert alert-warning"
                    data-repository-target="hint"
                    hidden
                  ></div>
                </fieldset>
                <div class="modal-action">
                  <form method="dialog">
                    <button class="btn" data-i18n="work.cancel"></button>
                  </form>
                  <button
                    type="button"
                    class="btn btn-primary"
                    data-repository-target="downloadButton"
                    data-action="repository#download"
                    data-i18n="repository.download"
                    disabled
                  ></button>
                </div>
              </div>
              <form method="dialog" class="modal-backdrop">
                <button>close</button>
              </form>
            </dialog>

            <fieldset class="fieldset text-sm" data-controller="logs">
              <legend class="fieldset-legend" data-i18n="settings.logs"
              ></legend>
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

            <fieldset class="fieldset text-sm" data-controller="licenses">
              <legend class="fieldset-legend" data-i18n="settings.about"
              ></legend>
              <div class="flex flex-col gap-1 text-base-content/70">
                <p data-i18n="settings.license"></p>
                <p>
                  This software uses code of FFmpeg licensed under the LGPLv2.1.
                  Transcription uses whisper.cpp and translation uses llama.cpp,
                  both under the MIT License. Each is bundled with Tsuzuri and
                  runs as a separate program, which an executable you choose or
                  have installed can replace.
                </p>
                <p>
                  Cleaning Simplified Chinese uses the dictionaries of OpenCC
                  (github.com/BYVoid/OpenCC) by BYVoid and contributors, under
                  the Apache License 2.0, compiled into Tsuzuri as they are
                  released.
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
                  <h3
                    class="text-lg font-bold"
                    data-i18n="settings.licenses"
                  ></h3>
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
          </div>
        </div>
        <input
          type="radio"
          name="settings-tabs"
          class="tab"
          data-i18n-label="settings.preferences"
        />
        <div class="tab-content pt-4">
          <fieldset class="fieldset text-sm" data-controller="preferences">
            <legend class="fieldset-legend" data-i18n="preferences.choosing"
            ></legend>
            <ul
              class="list rounded-box border border-base-300"
              data-preferences-target="landings"
            >
              <li class="list-row items-center text-xs text-base-content/60">
                <span class="list-col-grow">
                  <span
                    tabindex="0"
                    class="cursor-help"
                    data-i18n-tooltip="preferences.switchesHelp"
                    ><i data-lucide="info" class="size-3.5"></i></span
                  >
                </span>
                <span class="w-20 text-center" data-i18n="preferences.pausing"
                ></span>
                <span class="w-20 text-center" data-i18n="preferences.fromStart"
                ></span>
              </li>
            </ul>
            <p class="label" data-i18n="preferences.aloneHint"></p>
          </fieldset>
        </div>
      </div>
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
</main>
<ShortcutsDialog />
<UpdatesDialog />
<Notifications />
