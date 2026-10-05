<script lang="ts">
  import type { UpdateProgress } from "../backend/updates";
  import { t } from "../i18n";
  import { appUpdates } from "./context";

  const BYTES_PER_MEGABYTE = 1024 * 1024;

  const updates = appUpdates();

  let dialog: HTMLDialogElement;
  /** What the download reported last, none before it starts. */
  let progress = $state<UpdateProgress | null>(null);

  const title = $derived(
    updates.installingUpdate &&
      t(
        updates.installingUpdate.is_preview_build
          ? "settings.updatingToPreview"
          : "settings.updating",
        { releaseName: updates.installingUpdate.release_name },
      ),
  );
  /** How much is downloaded, as a percentage when the size is known. */
  const percent = $derived(
    progress?.total
      ? Math.floor((progress.downloaded * 100) / progress.total)
      : null,
  );
  const progressText = $derived(
    progress === null
      ? t("settings.updateStarting")
      : percent !== null
        ? t("settings.updateDownloading", { percent })
        : t("settings.updateDownloaded", {
            megabytes: Math.floor(progress.downloaded / BYTES_PER_MEGABYTE),
          }),
  );

  /** Shows the window while an App Update installs; Tsuzuri restarts when it is done. */
  $effect(() => {
    if (updates.installingUpdate) {
      progress = null;
      dialog.showModal();
    } else if (dialog.open) dialog.close();
  });
</script>

<svelte:window onrust:update-progress={({ detail }) => (progress = detail)} />

<dialog
  class="modal"
  bind:this={dialog}
  oncancel={(event) => event.preventDefault()}
>
  <div class="modal-box max-w-md">
    <h3 class="text-lg font-bold">{title}</h3>
    <p class="mt-4 text-sm">{progressText}</p>
    {#if percent === null}
      <progress class="progress progress-primary mt-2 w-full" max="100"
      ></progress>
    {:else}
      <progress
        class="progress progress-primary mt-2 w-full"
        max="100"
        value={percent}
      ></progress>
    {/if}
    <p class="mt-4 text-sm text-base-content/70">
      {t("settings.updateRestartHint")}
    </p>
  </div>
</dialog>
