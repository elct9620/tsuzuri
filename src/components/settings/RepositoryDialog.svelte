<dialog
  id="repository-dialog"
  class="modal"
  data-controller="repository"
  data-repository-target="dialog"
  data-action="close->repository#settle"
>
  <div class="modal-box">
    <h3 class="text-lg font-bold" data-repository-target="title"></h3>
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
