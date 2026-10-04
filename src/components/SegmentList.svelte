<p
  class="text-base-content/60"
  data-transcript-target="emptyHint"
  data-i18n="edit.empty"
></p>
<div class="sticky -top-4 z-10 mb-2 flex flex-col gap-2">
  <div
    class="flex flex-wrap items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
    data-search-target="bar"
    hidden
  >
    <div class="join">
      <label class="input input-sm join-item">
        <i data-lucide="search" class="size-4 opacity-50"></i>
        <input
          type="search"
          class="grow"
          data-search-target="pattern"
          data-i18n-label="search.pattern"
          data-action="input->search#search keydown.enter->search#next:!composing:prevent keydown.shift+enter->search#previous:!composing:prevent keydown.esc->search#close:!composing:prevent"
        />
        <span
          class="text-xs text-base-content/60 tabular-nums"
          data-search-target="count"
        ></span>
      </label>
      <button
        type="button"
        class="btn btn-sm btn-square join-item"
        data-action="search#previous"
        data-i18n-label="search.previous"
        data-shortcut="searchPrevious"
      >
        <i data-lucide="chevron-up" class="size-4"></i>
      </button>
      <button
        type="button"
        class="btn btn-sm btn-square join-item"
        data-action="search#next"
        data-i18n-label="search.next"
        data-shortcut="searchNext"
      >
        <i data-lucide="chevron-down" class="size-4"></i>
      </button>
    </div>
    <div class="join">
      <input
        type="radio"
        name="search-field"
        value="text"
        class="btn btn-sm join-item"
        data-search-target="field"
        data-i18n-label="replace.original"
        data-action="search#search"
        checked
      />
      <input
        type="radio"
        name="search-field"
        value="translation"
        class="btn btn-sm join-item"
        data-search-target="field"
        data-i18n-label="replace.translation"
        data-action="search#search"
      />
    </div>
    <label class="label">
      <input
        type="checkbox"
        class="checkbox checkbox-xs"
        data-search-target="regexToggle"
        data-action="search#search"
      />
      <span data-i18n="replace.regex"></span>
    </label>
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square ms-auto"
      data-action="search#close"
      data-i18n-label="search.close"
    >
      <i data-lucide="x" class="size-4"></i>
    </button>
  </div>
  <div
    class="flex items-center gap-2 rounded-box bg-base-200 px-3 py-1.5 text-sm"
    data-segment-changes-target="checkedBar"
    hidden
  >
    <span data-segment-changes-target="checkedCount"></span>
    <button
      type="button"
      class="btn btn-xs"
      data-segment-changes-target="mergeButton"
      data-action="segment-changes#merge"
      data-i18n="edit.merge"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-action="segment-changes#openShift"
      data-i18n="edit.shift"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-action="segment-changes#openSpeakers"
      data-i18n="edit.speakersOfChecked"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-segment-changes-target="retranslateButton"
      data-action="segment-changes#retranslate"
      data-i18n="edit.retranslate"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-segment-changes-target="retranscribeButton"
      data-action="segment-changes#retranscribe"
      data-i18n="edit.retranscribe"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-cleanup-target="checkedButton"
      data-action="cleanup#cleanChecked"
      data-i18n="cleanup.action"
      data-shortcut="cleanup"
    ></button>
    <button
      type="button"
      class="btn btn-xs"
      data-action="segment-changes#deleteChecked"
      data-i18n="edit.delete"
      data-shortcut="delete"
    ></button>
    <button
      type="button"
      class="btn btn-ghost btn-xs"
      data-action="segment-changes#clearChecks"
      data-i18n="edit.clearChecks"
    ></button>
  </div>
</div>
<dialog class="modal" data-segment-changes-target="shiftDialog">
  <div class="modal-box max-w-sm">
    <h3 class="mb-2 text-lg font-bold" data-i18n="edit.shiftTitle"></h3>
    <fieldset class="fieldset">
      <legend class="fieldset-legend" data-i18n="edit.offset"></legend>
      <input
        type="number"
        step="100"
        required
        class="input validator w-full"
        data-segment-changes-target="offset"
      />
    </fieldset>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn" data-i18n="work.cancel"></button>
      </form>
      <button
        type="button"
        class="btn btn-primary"
        data-action="segment-changes#shift"
        data-i18n="edit.shiftStart"
      ></button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
<ol
  class="list @container text-[15px] [&_.field]:block [&_.field]:min-h-8 [&_.field]:w-full [&_.field]:whitespace-pre-wrap [&_.field]:rounded-field [&_.field]:border [&_.field]:border-transparent [&_.field]:px-1.5 [&_.field]:py-1 [&_.field]:hover:border-base-300 [&_.field]:focus:border-base-content/40 [&_.field]:focus:outline-none [&_.field]:caret-transparent [&_.field]:selection:bg-transparent [&_.field::highlight(cursor)]:bg-primary/30 [&_.field:empty]:before:pointer-events-none [&_.field:empty]:before:text-base-content/40 [&_.field:empty]:before:content-[attr(data-placeholder)] [&_.field.translation]:text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))] [&_.field::highlight(compare-addition)]:bg-success/30 [&_.field::highlight(search-match)]:bg-warning/30 [&_.field::highlight(search-current)]:bg-warning/70 [&_time]:pt-1.5 [&_time]:text-xs [&_time]:text-base-content/60 [&_time]:tabular-nums [&>li]:list-row [&>li]:cursor-default [&>li[aria-current]]:bg-primary/10 [&>li[data-is-playing]]:shadow-[inset_3px_0_0_var(--color-primary)]"
  data-transcript-target="list"
  data-comparison-target="list"
></ol>
