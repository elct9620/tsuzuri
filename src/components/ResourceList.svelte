<div class="drawer-side">
  <label
    for="resources-drawer"
    class="drawer-overlay"
    data-i18n-label="resources.close"
  ></label>
  <div class="flex min-h-full w-56 flex-col bg-base-300">
    <ul class="menu w-full pb-0">
      <li class="menu-title flex flex-row items-center justify-between">
        <span data-i18n="resources.title"></span>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs"
          data-action="project#reload"
          data-i18n-label="resources.reload"
          data-i18n-tooltip="resources.reloadHint"
          data-shortcut="reload"
        >
          <i data-lucide="refresh-cw" class="size-3.5"></i>
        </button>
      </li>
    </ul>
    <ul
      class="menu w-full grow gap-1 [&_button]:flex"
      data-project-target="resources"
    ></ul>
    <div class="contents" data-controller="glossary">
      <ul class="menu w-full text-base-content/70">
        <li>
          <button
            type="button"
            data-project-target="glossary"
            data-action="glossary#open"
          ></button>
        </li>
      </ul>
      <dialog class="modal" data-glossary-target="dialog">
        <div class="modal-box max-w-5xl">
          <h3
            class="mb-2 text-lg font-bold"
            data-i18n="translate.glossary"
          ></h3>
          <div
            role="alert"
            class="alert alert-warning mb-2"
            data-glossary-target="warning"
            hidden
          >
            <span data-i18n="glossary.sourceTargetHeader"></span>
          </div>
          <div
            role="alert"
            class="alert alert-error mb-2"
            data-glossary-target="failure"
            hidden
          ></div>
          <div class="max-h-[60vh] overflow-auto">
            <table class="table table-sm table-pin-rows">
              <thead>
                <tr data-glossary-target="languages"></tr>
              </thead>
              <tbody data-glossary-target="rows"></tbody>
            </table>
          </div>
          <button
            type="button"
            class="btn btn-sm mt-2"
            data-action="glossary#addRow"
            data-i18n="glossary.addRow"
          ></button>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn" data-i18n="work.cancel"></button>
            </form>
            <button
              type="button"
              class="btn btn-primary"
              data-glossary-target="saveButton"
              data-action="glossary#save"
              data-i18n="glossary.save"
            ></button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  </div>
</div>
