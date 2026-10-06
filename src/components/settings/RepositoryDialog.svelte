<script lang="ts">
  import {
    repositoryFiles,
    type ModelSlot,
    type RepositoryFile,
  } from "#/backend/toolchain.ts";
  import { t } from "#/i18n.ts";
  import { failureMessage } from "#/ui/failure.ts";
  import { sizeLabel, type HubFile } from "#/ui/models.ts";

  let dialog: HTMLDialogElement;
  let repoField: HTMLInputElement;
  let slot = $state<ModelSlot>("transcription");
  let repo = $state("");
  let files = $state<RepositoryFile[]>([]);
  /** The path of the file checked in the list, or none. */
  let checkedFile = $state<string | null>(null);
  /** Why the Repository holds nothing to list, or why it was not listed. */
  let hint = $state<string | null>(null);
  let listedRepo: string | null = null;
  let answer: ((pick: HubFile | null) => void) | null = null;
  let pickedFile: HubFile | null = null;

  /** Opens the dialog for `slot`, answering the file the user picks, or none. */
  export function pick(target: ModelSlot): Promise<HubFile | null> {
    slot = target;
    showFiles([]);
    hint = null;
    dialog.showModal();
    repoField.focus();
    return new Promise((resolve) => (answer = resolve));
  }

  async function list(): Promise<void> {
    const name = repo.trim();
    if (name === "") return;
    showFiles([]);
    hint = null;
    try {
      const listed = await repositoryFiles(name, slot);
      listedRepo = name;
      showFiles(listed);
      if (listed.length === 0)
        hint = t("repository.noModel", { slot: t(`slots.${slot}`) });
    } catch (error) {
      hint = failureMessage(error);
    }
  }

  function download(): void {
    if (listedRepo === null || checkedFile === null) return;
    pickedFile = { repo: listedRepo, file: checkedFile };
    dialog.close();
  }

  /** Answers what was picked once the dialog closes, however it closed. */
  function settle(): void {
    answer?.(pickedFile);
    answer = null;
    pickedFile = null;
  }

  function showFiles(listed: RepositoryFile[]): void {
    files = listed;
    checkedFile = null;
  }
</script>

<dialog class="modal" bind:this={dialog} onclose={settle}>
  <div class="modal-box">
    <h3 class="text-lg font-bold">
      {t("repository.title", { slot: t(`slots.${slot}`) })}
    </h3>
    <fieldset class="fieldset gap-3 text-sm">
      <p class="label">{t("repository.nameHint")}</p>
      <div class="join w-full">
        <input
          type="text"
          class="input join-item w-full"
          placeholder="owner/name"
          spellcheck="false"
          bind:this={repoField}
          bind:value={repo}
          onkeydown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void list();
          }}
        />
        <button type="button" class="btn join-item" onclick={list}
          >{t("repository.list")}</button
        >
      </div>
      {#if files.length > 0}
        <div
          class="list max-h-72 overflow-y-auto rounded-box border border-base-300"
        >
          {#each files as file (file.path)}
            <label class="list-row cursor-pointer items-center">
              <input
                type="radio"
                name="repository-file"
                class="radio radio-sm"
                value={file.path}
                bind:group={checkedFile}
              />
              <span class="break-all">{file.path}</span>
              <span class="text-base-content/70 whitespace-nowrap"
                >{sizeLabel(file.size)}</span
              >
            </label>
          {/each}
        </div>
      {/if}
      {#if hint !== null}
        <div role="alert" class="alert alert-warning">{hint}</div>
      {/if}
    </fieldset>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button
        type="button"
        class="btn btn-primary"
        disabled={checkedFile === null}
        onclick={download}>{t("repository.download")}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
