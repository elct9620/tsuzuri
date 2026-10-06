<script lang="ts">
  import { diarize } from "#/ipc/diarization.ts";
  import type { ProjectView } from "#/ipc/project.ts";
  import { modelSettings } from "#/ipc/toolchain.ts";
  import { t } from "#/i18n.ts";
  import { chosenModelName } from "#/ui/models.ts";
  import { notifyDiarization } from "#/state/notification.svelte.ts";
  import { taskRun } from "#/state/context.ts";

  const run = taskRun();
  let dialog: HTMLDialogElement;
  let { project }: { project: ProjectView | null } = $props();
  /** The file of the diarization Model it runs with, once read. */
  let model = $state("");
  /** Whether the Segments carry Speakers the diarization replaces, as of opening. */
  let hasSpeakers = $state(false);

  export async function open(): Promise<void> {
    hasSpeakers = (project?.segments ?? []).some(
      (segment) => (segment.speaker ?? null) !== null,
    );
    dialog.showModal();
    model = chosenModelName(
      (await modelSettings())?.diarization.source ?? null,
    );
  }

  async function start(): Promise<void> {
    if (run.isBusy) return;
    dialog.close();
    await run.perform("diarization", async () => {
      notifyDiarization(await diarize());
    });
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
