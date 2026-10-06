<!--
  @component
  The transcribe dialog: it transcribes the Current Resource into its original subtitle, whole or
  from a Segment onward or over a span of them.
-->
<script lang="ts">
  import { diarize } from "#/ipc/diarization.ts";
  import {
    currentResource,
    spanIndexes,
    type ProjectView,
    type SegmentSpan,
  } from "#/ipc/project.ts";
  import { modelSettings } from "#/ipc/toolchain.ts";
  import { transcribe, type TranscriptionScope } from "#/ipc/transcription.ts";
  import { translateSegments } from "#/ipc/translation.ts";
  import { t } from "#/i18n.ts";
  import { chosenModelName } from "#/ui/models.ts";
  import {
    notifyDiarization,
    notifyTranscription,
    notifyTranslation,
  } from "#/state/notification.svelte.ts";
  import { formatTime } from "#/ui/time.ts";
  import { taskRun } from "#/state/context.ts";
  import { TranslationChoices } from "#/state/translation-choices.svelte.ts";
  import TranslationOptions from "#/components/TranslationOptions.svelte";

  const run = taskRun();
  let dialog: HTMLDialogElement;
  let options = $state<TranslationOptions>();
  const choices = new TranslationChoices();
  let { project }: { project: ProjectView | null } = $props();
  let scope = $state<TranscriptionScope>({ kind: "whole" });
  /** Whether to diarize the Transcript once transcribed, before any translation. */
  let isDiarizedAfter = $state(false);
  /** Whether to translate the Transcript once transcribed, with the translation options it shows. */
  let isTranslatedAfter = $state(false);
  /** Whether the Language chosen is already translated. */
  const isLanguageTranslated = $derived(choices.isTranslated(project));
  /** The file of the transcription Model it runs with, the Project Model when there is one. */
  let model = $state("");

  const isWhole = $derived(scope.kind === "whole");
  /** Translating afterwards within an Audio Window needs a translation shown to translate into. */
  const isTranslationOffered = $derived(
    isWhole || (project?.shown_translation ?? null) !== null,
  );

  /** What starting overwrites, warned of once: the original subtitle, the translation, or both. */
  const warning = $derived.by(() => {
    const hasSubtitle = currentResource(project)?.has_subtitle ?? false;
    const isTranslationOverwritten = isTranslatedAfter && isLanguageTranslated;
    if (!isWhole) return "transcribe.overwriteScope";
    if (hasSubtitle)
      return isTranslationOverwritten
        ? "transcribe.overwriteBoth"
        : "transcribe.overwrite";
    return isTranslationOverwritten ? "translate.overwrite" : null;
  });

  /** Names the Audio Window by the times of the Segments it starts and ends at. */
  const scopeLabel = $derived.by(() => {
    const segments = project?.segments ?? [];
    switch (scope.kind) {
      case "whole":
        return "";
      case "rest":
        return t("transcribe.scopeRest", {
          time: formatTime(segments[scope.first]?.start_ms ?? 0),
        });
      case "span": {
        const span = segments.slice(scope.first, scope.last + 1);
        return t("transcribe.scopeSpan", {
          start: formatTime(span[0]?.start_ms ?? 0),
          end: formatTime(
            Math.max(0, ...span.map((segment) => segment.end_ms)),
          ),
        });
      }
    }
  });

  /** Opens the dialog to transcribe the whole Current Resource. */
  export async function open(): Promise<void> {
    scope = { kind: "whole" };
    await showDialog();
  }

  /** Opens the dialog to transcribe within `chosenScope`. */
  export async function openForScope(
    chosenScope: TranscriptionScope,
  ): Promise<void> {
    scope = chosenScope;
    await showDialog();
  }

  async function showDialog(): Promise<void> {
    isDiarizedAfter =
      isWhole && (project?.options.is_diarized_after_transcription ?? false);
    if (!isTranslationOffered) isTranslatedAfter = false;
    if (project !== null)
      choices.reset(project, isWhole ? null : project.shown_translation);
    dialog.showModal();
    model = chosenModelName(
      project?.options.models.transcription ??
        (await modelSettings())?.transcription.source ??
        null,
    );
  }

  async function start(): Promise<void> {
    if (
      run.isBusy ||
      (isTranslatedAfter && options?.reportValidity() === false)
    )
      return;
    dialog.close();
    await run.perform("transcription", async () => {
      const transcription = await transcribe(
        !isWhole || (currentResource(project)?.has_subtitle ?? false),
        scope,
      );
      notifyTranscription(transcription);
      if (isDiarizedAfter) {
        run.begin("diarization");
        notifyDiarization(await diarize());
      }
      if (isTranslatedAfter)
        await translateAfterwards(transcription.written_span);
    });
  }

  /**
   * Translates what the transcription wrote with the options the dialog shows: the whole subtitle,
   * or within an Audio Window the Segments it wrote again, none when it wrote none.
   */
  async function translateAfterwards(span: SegmentSpan | null): Promise<void> {
    if (!isWhole && span === null) return;
    run.begin("translation");
    notifyTranslation(
      await translateSegments(
        choices.language,
        choices.options,
        isWhole || span === null ? null : spanIndexes(span),
      ),
    );
  }
</script>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box">
    <h3 class="text-lg font-bold">
      {t(isWhole ? "toolbar.transcribe" : "transcribe.again")}
    </h3>
    <fieldset class="fieldset gap-3 text-sm">
      {#if !isWhole}
        <p class="flex items-center gap-2">
          <span>{t("work.scope")}</span>
          <span>{scopeLabel}</span>
        </p>
      {/if}
      <p class="flex items-center gap-2">
        <span>{t("transcribe.language")}</span>
        <span>{project === null ? "" : t(`languages.${project.language}`)}</span
        >
      </p>
      <p class="flex items-center gap-2">
        <span>{t("transcribe.model")}</span>
        <span class="break-all text-base-content/70">{model}</span>
      </p>
      {#if isWhole}
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            bind:checked={isDiarizedAfter}
          />
          <span>{t("transcribe.diarizeAfter")}</span>
        </label>
      {/if}
      {#if isTranslationOffered}
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            bind:checked={isTranslatedAfter}
          />
          <span>{t("transcribe.translateAfter")}</span>
        </label>
      {/if}
      {#if isTranslatedAfter}
        <fieldset
          class="fieldset gap-3 rounded-box border border-base-300 px-4 pb-4"
        >
          <legend class="fieldset-legend">{t("toolbar.translate")}</legend>
          <TranslationOptions
            bind:this={options}
            {choices}
            glossary={project?.translation_glossary ?? null}
          />
        </fieldset>
      {/if}
    </fieldset>
    {#if warning !== null}
      <div role="alert" class="alert alert-warning mt-2">
        <span>{t(warning)}</span>
      </div>
    {/if}
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button type="button" class="btn btn-primary" onclick={start}
        >{t(
          warning === null
            ? "transcribe.start"
            : "transcribe.overwriteAndStart",
        )}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
