<script lang="ts">
  import { onMount } from "svelte";

  import { diarize } from "#/ipc/diarization.ts";
  import type { ProjectView } from "#/ipc/project.ts";
  import { modelSettings } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import { sourceFileName } from "#/ui/models.ts";
  import { notifyDiarization } from "#/ui/notification.svelte.ts";
  import { projectFeed, taskRun } from "#/components/context.ts";

  const feed = projectFeed();
  const run = taskRun();
  let dialog: HTMLDialogElement;
  let project = $state<ProjectView | null>(null);
  /** The file of the diarization Model it runs with, once read. */
  let model = $state("");
  /** Whether the Segments carry Speakers the diarization replaces, as of opening. */
  let hasSpeakers = $state(false);

  onMount(() => feed.follow((next) => (project = next)));

  export async function open(): Promise<void> {
    hasSpeakers = (project?.segments ?? []).some(
      (segment) => (segment.speaker ?? null) !== null,
    );
    dialog.showModal();
    const source = (await modelSettings())?.diarization.source ?? null;
    model = source === null ? t("models.notChosen") : sourceFileName(source);
  }

  async function start(): Promise<void> {
    if (run.isBusy) return;
    dialog.close();
    run.begin("diarization");
    try {
      notifyDiarization(await diarize());
      run.finish();
    } catch (error) {
      run.fail(error);
    }
  }
</script>

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box">
    <h3 class="text-lg font-bold">{t("diarize.title")}</h3>
    <fieldset class="fieldset gap-3 text-sm">
      <p class="flex flex-wrap items-center gap-2">
        <span>{t("diarize.model")}</span>
        <span class="break-all">{model}</span>
      </p>
    </fieldset>
    {#if hasSpeakers}
      <div role="alert" class="alert alert-warning mt-2">
        <span>{t("diarize.overwrite")}</span>
      </div>
    {/if}
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button type="button" class="btn btn-primary" onclick={start}
        >{t(
          hasSpeakers ? "diarize.overwriteAndStart" : "diarize.start",
        )}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
