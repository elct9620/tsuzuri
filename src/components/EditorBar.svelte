<script lang="ts">
  import TaskProgress from "./TaskProgress.svelte";
</script>

<div class="flex items-center gap-2 border-b border-base-300 px-4 py-2">
  <div class="flex min-w-0 grow items-center gap-2">
    <h2 class="truncate font-semibold" data-transcript-target="heading"></h2>
    <span
      class="flex shrink-0 items-center gap-1 text-sm text-base-content/70 opacity-0 transition-opacity duration-200 ease-out data-is-shown:opacity-100 motion-reduce:transition-none"
      role="status"
      data-save-mark
      ><i data-lucide="check" class="size-4 text-success"></i><span
        data-save-mark-label
      ></span></span
    >
  </div>
  <label class="flex items-center gap-2 text-sm"
    ><span class="hidden @5xl:inline" data-i18n="edit.translation"></span>
    <select
      class="select select-sm w-auto"
      data-i18n-label="edit.translation"
      data-transcript-target="translationLanguage"
      data-action="change->transcript#showTranslation"
    ></select>
  </label>
  <div class="dropdown dropdown-end">
    <div
      tabindex="0"
      role="button"
      class="btn btn-sm"
      data-i18n-label="compare.label"
      data-i18n-tooltip="compare.label"
    >
      <i data-lucide="git-compare" class="size-4"></i><span
        class="hidden @5xl:inline"
        data-i18n="compare.label"
      ></span>
      <i data-lucide="chevron-down" class="size-4"></i>
    </div>
    <div
      tabindex="-1"
      class="dropdown-content z-20 w-64 rounded-box bg-base-100 shadow-md"
      data-comparison-target="menu"
    ></div>
  </div>
  <div class="contents" data-controller="versions">
    <button
      type="button"
      class="btn btn-sm"
      data-action="versions#open"
      data-i18n-label="versions.open"
      data-i18n-tooltip="versions.open"
    >
      <i data-lucide="history" class="size-4"></i><span
        class="hidden @5xl:inline"
        data-i18n="versions.open"
      ></span>
    </button>
    <dialog class="modal" data-versions-target="dialog">
      <div class="modal-box max-w-4xl">
        <h3 class="mb-2 text-lg font-bold" data-i18n="versions.title"></h3>
        <label class="mb-2 flex items-center gap-2 text-sm"
          ><span data-i18n="versions.subtitle"></span>
          <select
            class="select select-sm w-auto"
            data-versions-target="subtitle"
            data-action="change->versions#showBackups"
          ></select>
        </label>
        <ul
          class="list rounded-box border border-base-300 text-sm"
          data-versions-target="backups"
        ></ul>
        <section class="mt-4" data-versions-target="comparison" hidden>
          <div class="mb-2 flex items-center gap-2">
            <select
              class="select select-sm w-auto"
              data-versions-target="leftVersion"
              data-action="change->versions#showComparison"
            ></select>
            <i
              data-lucide="arrow-left-right"
              class="size-4 text-base-content/60"
            ></i>
            <select
              class="select select-sm w-auto"
              data-versions-target="rightVersion"
              data-action="change->versions#showComparison"
            ></select>
            <label class="ml-auto flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                data-versions-target="differenceFilter"
                data-action="change->versions#showOnlyDifferences"
              />
              <span data-i18n="versions.onlyDifferences"></span>
            </label>
            <button
              type="button"
              class="btn btn-square btn-sm"
              data-action="versions#moveToPreviousDifference"
              data-i18n-label="versions.previousDifference"
            >
              <i data-lucide="chevron-up" class="size-4"></i>
            </button>
            <button
              type="button"
              class="btn btn-square btn-sm"
              data-action="versions#moveToNextDifference"
              data-i18n-label="versions.nextDifference"
            >
              <i data-lucide="chevron-down" class="size-4"></i>
            </button>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <table class="table table-sm">
              <tbody data-versions-target="rows"></tbody>
            </table>
          </div>
        </section>
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
  </div>
  <button
    type="button"
    class="btn btn-sm"
    data-action="speakers#open"
    data-i18n-label="edit.speakers"
    data-i18n-tooltip="edit.speakers"
  >
    <i data-lucide="users" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="edit.speakers"
    ></span>
  </button>
  <dialog class="modal" data-speakers-target="dialog">
    <div class="modal-box max-w-md">
      <h3 class="mb-2 text-lg font-bold" data-i18n="edit.speakersTitle"></h3>
      <fieldset class="fieldset gap-2 text-sm">
        <legend class="fieldset-legend" data-i18n="edit.speakersScope"></legend>
        <label
          class="flex items-center gap-2"
          data-speakers-target="checkedChoice"
        >
          <input
            type="radio"
            name="speaker-scope"
            value="checked-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-speakers-target="checkedCount"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="all-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersEvery"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="unnamed-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersUnnamed"></span>
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="speaker-scope"
            value="named-segments"
            class="radio radio-sm"
            data-speakers-target="scope"
          />
          <span data-i18n="edit.speakersNamedBefore"></span>
          <select
            class="select select-xs w-auto"
            data-speakers-target="renamedSpeaker"
          ></select>
          <span data-i18n="edit.speakersNamedAfter"></span>
        </label>
      </fieldset>
      <fieldset class="fieldset gap-2 text-sm">
        <legend class="fieldset-legend" data-i18n="edit.speakersTo"></legend>
        <input class="input input-sm" data-speakers-target="newSpeaker" />
        <div class="flex flex-wrap gap-1" data-speakers-target="names"></div>
      </fieldset>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn" data-i18n="work.cancel"></button>
        </form>
        <button
          type="button"
          class="btn btn-primary"
          data-action="speakers#apply"
          data-i18n="edit.apply"
        ></button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
  <button
    type="button"
    class="btn btn-sm"
    data-action="replacement#open"
    data-i18n-label="replace.open"
    data-i18n-tooltip="replace.open"
    data-shortcut="replace"
  >
    <i data-lucide="replace" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="replace.open"
    ></span>
  </button>
  <button
    type="button"
    class="btn btn-sm"
    data-action="search#open"
    data-i18n-label="search.open"
    data-i18n-tooltip="search.open"
    data-shortcut="search"
  >
    <i data-lucide="search" class="size-4"></i><span
      class="hidden @5xl:inline"
      data-i18n="search.open"
    ></span>
  </button>
  <dialog class="modal" data-replacement-target="dialog">
    <div class="modal-box max-w-md">
      <h3 class="mb-2 text-lg font-bold" data-i18n="replace.title"></h3>
      <fieldset class="fieldset gap-2 text-sm">
        <label class="flex items-center gap-2">
          <span class="w-16" data-i18n="replace.pattern"></span>
          <input
            class="input input-sm grow"
            data-replacement-target="pattern"
            data-action="keydown.enter->replacement#apply:!composing:prevent"
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="w-16" data-i18n="replace.substitute"></span>
          <input
            class="input input-sm grow"
            data-replacement-target="substitute"
            data-action="keydown.enter->replacement#apply:!composing:prevent"
          />
        </label>
        <div class="flex items-center gap-4">
          <span class="w-16" data-i18n="replace.field"></span>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="replacement-field"
              value="text"
              class="radio radio-sm"
              data-replacement-target="field"
              checked
            />
            <span data-i18n="replace.original"></span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="radio"
              name="replacement-field"
              value="translation"
              class="radio radio-sm"
              data-replacement-target="field"
            />
            <span data-i18n="replace.translation"></span>
          </label>
        </div>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            data-replacement-target="regexToggle"
          />
          <span data-i18n="replace.regex"></span>
          <span class="text-base-content/60" data-i18n="replace.groups"></span>
        </label>
      </fieldset>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn" data-i18n="work.cancel"></button>
        </form>
        <button
          type="button"
          class="btn btn-primary"
          data-action="replacement#apply"
          data-i18n="replace.apply"
        ></button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
  <TaskProgress />
  <button
    type="button"
    class="btn btn-square btn-sm"
    data-preview-target="playerFoldButton"
    data-action="preview#togglePlayerFold"
    data-i18n-label="preview.foldPlayer"
    data-i18n-tooltip="preview.foldPlayer"
    hidden
  >
    <i data-lucide="square-play" class="size-4"></i>
  </button>
  <button
    type="button"
    class="btn btn-square btn-sm"
    data-preview-target="timelineFoldButton"
    data-action="preview#toggleTimelineFold"
    data-i18n-label="preview.foldTimeline"
    data-i18n-tooltip="preview.foldTimeline"
    hidden
  >
    <i data-lucide="audio-waveform" class="size-4"></i>
  </button>
</div>
