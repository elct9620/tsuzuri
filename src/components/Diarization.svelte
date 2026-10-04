<script lang="ts">
  import Users from "@lucide/svelte/icons/users";
  import { onMount } from "svelte";

  import { diarize } from "../backend/diarization";
  import { currentResource, type ProjectView } from "../backend/project";
  import { modelSettings } from "../backend/toolchain";
  import { t } from "../i18n";
  import { sourceFileName } from "../ui/models";
  import { notifyDiarization } from "../ui/notification";
  import { projectFeed, taskRun } from "./context";

  const feed = projectFeed();
  const run = taskRun();
  let dialog: HTMLDialogElement;
  let project = $state<ProjectView | null>(null);
  /** The file of the diarization Model it runs with, once read. */
  let model = $state("");
  /** Whether the Segments carry Speakers the diarization replaces, as of opening. */
  let hasSpeakers = $state(false);

  /** Usable only for a Current Resource with a media file and a subtitle. */
  const isOffered = $derived.by(() => {
    const resource = currentResource(project);
    return (resource?.has_media ?? false) && (resource?.has_subtitle ?? false);
  });

  onMount(() => feed.follow((next) => (project = next)));

  async function open(): Promise<void> {
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

<button
  type="button"
  class="btn btn-sm"
  aria-label={t("toolbar.diarize")}
  data-tooltip={t("toolbar.diarize")}
  disabled={!isOffered}
  onclick={open}
>
  <Users class="size-4" /><span class="hidden @5xl:inline"
    >{t("toolbar.diarize")}</span
  >
</button>
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
