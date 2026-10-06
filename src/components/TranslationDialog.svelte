<!--
  @component
  The translate dialog: it translates the Current Resource's original subtitle, or translates
  chosen Segments again into the translation shown.
-->
<script lang="ts">
  import type { ProjectView } from "#/ipc/project.ts";
  import { translateSegments } from "#/ipc/translation.ts";
  import { t } from "#/i18n.ts";
  import { notifyTranslation } from "#/state/notification.svelte.ts";
  import { taskRun } from "#/state/context.ts";
  import { TranslationChoices } from "#/state/translation-choices.svelte.ts";
  import TranslationOptions from "#/components/TranslationOptions.svelte";

  const run = taskRun();
  let dialog: HTMLDialogElement;
  let options: TranslationOptions;
  const choices = new TranslationChoices();
  let { project }: { project: ProjectView | null } = $props();
  /** The Segments to translate again, or none to translate the whole subtitle. */
  let chosenIndexes = $state<number[] | null>(null);
  /** Whether the Language chosen is already translated. */
  const isLanguageTranslated = $derived(choices.isTranslated(project));

  /** Translating chosen Segments again is one step to undo, so it overwrites nothing to warn of. */
  const isOverwriting = $derived(
    isLanguageTranslated && chosenIndexes === null,
  );

  const scopeLabel = $derived(
    chosenIndexes === null
      ? ""
      : chosenIndexes.length === 1
        ? t("translate.scopeSegment", { number: chosenIndexes[0] + 1 })
        : t("translate.scopeChecked", { count: chosenIndexes.length }),
  );

  /** Opens the dialog to translate the whole original subtitle. */
  export function open(): void {
    chosenIndexes = null;
    showDialog();
  }

  /** Opens the dialog to translate the Segments at `indexes` again. */
  export function openForSegments(indexes: number[]): void {
    chosenIndexes = indexes;
    showDialog();
  }

  function showDialog(): void {
    if (project !== null)
      choices.reset(
        project,
        chosenIndexes === null ? null : project.shown_translation,
      );
    dialog.showModal();
  }

  async function start(): Promise<void> {
    if (run.isBusy || !options.reportValidity()) return;
    dialog.close();
    await run.perform("translation", async () => {
      notifyTranslation(
        await translateSegments(
          choices.language,
          choices.options,
          chosenIndexes,
        ),
      );
    });
  }
</script>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box">
    <h3 class="text-lg font-bold">
      {t(chosenIndexes === null ? "toolbar.translate" : "translate.again")}
    </h3>
    <fieldset class="fieldset gap-3 text-sm">
      {#if chosenIndexes !== null}
        <p class="flex items-center gap-2">
          <span>{t("work.scope")}</span>
          <span>{scopeLabel}</span>
        </p>
      {/if}
      <p class="flex flex-wrap items-center gap-2">
        <span>{t("translate.source")}</span>
        <span>{project === null ? "" : t(`languages.${project.language}`)}</span
        >
      </p>
      <TranslationOptions
        bind:this={options}
        {choices}
        glossary={project?.translation_glossary ?? null}
      />
    </fieldset>
    {#if isOverwriting}
      <div role="alert" class="alert alert-warning mt-2">
        <span>{t("translate.overwrite")}</span>
      </div>
    {/if}
    {#if chosenIndexes !== null}
      <div role="alert" class="alert alert-info mt-2">
        <span>{t("translate.continuation")}</span>
      </div>
    {/if}
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button type="button" class="btn btn-primary" onclick={start}
        >{t(
          isOverwriting ? "translate.overwriteAndStart" : "translate.start",
        )}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
