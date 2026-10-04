<script lang="ts">
  import Diarization from "./Diarization.svelte";
  import Transcription from "./Transcription.svelte";
  import Translation from "./Translation.svelte";
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

    <Transcription />

    <Translation />

    <Diarization />

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
