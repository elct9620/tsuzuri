<!--
  @component
  The translate dialog: it translates the Current Resource's original subtitle, or translates
  chosen Segments again into the translation shown.
-->
<script lang="ts">
  import Languages from "@lucide/svelte/icons/languages";
  import { onMount } from "svelte";

  import { currentResource, type ProjectView } from "../backend/project";
  import { translateSegments } from "../backend/translation";
  import { t } from "../i18n";
  import { notifyTranslation } from "../ui/notification";
  import { projectFeed, taskRun } from "./context";
  import TranslationOptions from "./TranslationOptions.svelte";

  const feed = projectFeed();
  const run = taskRun();
  let dialog: HTMLDialogElement;
  let options: TranslationOptions;
  let project = $state<ProjectView | null>(null);
  /** The Segments to translate again, or none to translate the whole subtitle. */
  let chosenIndexes = $state<number[] | null>(null);
  /** Whether the Language chosen is already translated. */
  let isLanguageTranslated = $state(false);

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

  onMount(() => feed.follow((next) => (project = next)));

  function open(): void {
    chosenIndexes = null;
    showDialog();
  }

  /** Opens the dialog to translate the Segments at `indexes` again, as the editor asks. */
  function openForSegments({
    detail,
  }: CustomEvent<{ indexes: number[] }>): void {
    chosenIndexes = detail.indexes;
    showDialog();
  }

  function showDialog(): void {
    if (project !== null)
      options.show(
        project,
        chosenIndexes === null ? null : project.shown_translation,
      );
    dialog.showModal();
  }

  async function start(): Promise<void> {
    if (run.isBusy || !options.reportValidity()) return;
    dialog.close();
    run.begin("translation");
    try {
      const { language, options: chosen } = options.choices();
      notifyTranslation(
        await translateSegments(language, chosen, chosenIndexes),
      );
      run.finish();
    } catch (error) {
      run.fail(error);
    }
  }
</script>

<svelte:window onsegment-changes:retranslate={openForSegments} />

<button
  type="button"
  class="btn btn-sm"
  aria-label={t("toolbar.translate")}
  data-tooltip={t("toolbar.translate")}
  disabled={!(currentResource(project)?.has_subtitle ?? false)}
  onclick={open}
>
  <Languages class="size-4" /><span class="hidden @5xl:inline"
    >{t("toolbar.translate")}</span
  >
</button>
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
        onoverwrite={(isTranslated) => (isLanguageTranslated = isTranslated)}
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
