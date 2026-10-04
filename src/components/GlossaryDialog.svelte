<script lang="ts">
  import X from "@lucide/svelte/icons/x";

  import {
    saveTranslationGlossary,
    translationGlossaryTable,
    type GlossaryRow,
    type GlossaryTable,
  } from "../backend/project";
  import { t } from "../i18n";
  import { failureMessage } from "../ui/failure";

  let dialog: HTMLDialogElement;
  /** The Language of each column. */
  let languages = $state<string[]>([]);
  let rows = $state<GlossaryRow[]>([]);
  /** Whether the glossary was read from a `source,target` header, which saving writes as Language codes. */
  let hasSourceTargetHeader = $state(false);
  /** Why the glossary could not be read or saved, once it could not. */
  let failure = $state<string | null>(null);
  /** Whether the glossary was read, so a file that could not be read is never saved over. */
  let isRead = $state(false);

  /** Reads the glossary afresh and opens its dialog: every Language a column and every term a row of fields with whether it names a Speaker. */
  export async function open(): Promise<void> {
    failure = null;
    try {
      show(await translationGlossaryTable());
      isRead = true;
    } catch (error) {
      show({ languages: [], rows: [], has_source_target_header: false });
      isRead = false;
      failure = failureMessage(error);
    }
    dialog.showModal();
  }

  function show(table: GlossaryTable): void {
    languages = table.languages;
    rows = table.rows;
    hasSourceTargetHeader = table.has_source_target_header;
  }

  function addRow(): void {
    rows.push({ words: languages.map(() => ""), is_speaker: false });
  }

  function removeRow(index: number): void {
    rows.splice(index, 1);
  }

  async function save(): Promise<void> {
    try {
      await saveTranslationGlossary($state.snapshot(rows));
      dialog.close();
    } catch (error) {
      failure = failureMessage(error);
    }
  }
</script>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-5xl">
    <h3 class="mb-2 text-lg font-bold">{t("translate.glossary")}</h3>
    <div
      role="alert"
      class="alert alert-warning mb-2"
      hidden={!hasSourceTargetHeader}
    >
      <span>{t("glossary.sourceTargetHeader")}</span>
    </div>
    <div role="alert" class="alert alert-error mb-2" hidden={failure === null}>
      {failure}
    </div>
    <div class="max-h-[60vh] overflow-auto">
      <table class="table table-sm table-pin-rows">
        <thead>
          <tr>
            {#each languages as code (code)}
              <th>{t(`languages.${code}`)}</th>
            {/each}
            <th>{t("glossary.speaker")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, index (row)}
            <tr>
              {#each row.words, column}
                <td>
                  <input
                    type="text"
                    class="input input-sm w-full min-w-32"
                    bind:value={row.words[column]}
                  />
                </td>
              {/each}
              <td>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  aria-label={t("glossary.speaker")}
                  bind:checked={row.is_speaker}
                />
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-square btn-ghost btn-sm"
                  aria-label={t("glossary.removeRow")}
                  onclick={() => removeRow(index)}><X class="size-4" /></button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button type="button" class="btn btn-sm mt-2" onclick={addRow}
      >{t("glossary.addRow")}</button
    >
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button
        type="button"
        class="btn btn-primary"
        disabled={!isRead}
        onclick={save}>{t("glossary.save")}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
