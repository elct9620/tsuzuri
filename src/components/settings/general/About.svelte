<script lang="ts">
  import { openReleases, openSponsorship } from "../../../backend/about";
  import { t } from "../../../i18n";
  import { notifyFailure } from "../../../ui/notification";

  let dialog: HTMLDialogElement;
  /** The License Notice, read the first time the dialog opens; null for a build without one. */
  let notice = $state<string | null>();

  async function showLicenses(): Promise<void> {
    dialog.showModal();
    if (notice !== undefined) return;
    notice = await licenseNotice();
  }

  /**
   * The License Notice CI writes into the interface, or null for a build without one,
   * where the page answered in its place is not the notice.
   */
  async function licenseNotice(): Promise<string | null> {
    try {
      const response = await fetch("LICENSE.html");
      if (!response.ok) return null;
      const text = await response.text();
      const page = new DOMParser().parseFromString(text, "text/html");
      return page.querySelector("section#tsuzuri") ? text : null;
    } catch {
      return null;
    }
  }

  async function openSource(): Promise<void> {
    try {
      await openReleases();
    } catch (error) {
      notifyFailure(t("settings.releasesNotOpened"), error);
    }
  }

  async function openSponsorshipPage(): Promise<void> {
    try {
      await openSponsorship();
    } catch (error) {
      notifyFailure(t("settings.sponsorshipNotOpened"), error);
    }
  }
</script>

<fieldset class="fieldset text-sm">
  <legend class="fieldset-legend">{t("settings.about")}</legend>
  <div class="flex flex-col gap-1 text-base-content/70">
    <p>{t("settings.license")}</p>
    <p>
      This software uses code of FFmpeg licensed under the LGPLv2.1.
      Transcription uses whisper.cpp and translation uses llama.cpp, both under
      the MIT License. Each is bundled with Tsuzuri and runs as a separate
      program, which an executable you choose or have installed can replace.
    </p>
    <p>
      Cleaning Simplified Chinese uses the dictionaries of OpenCC
      (github.com/BYVoid/OpenCC) by BYVoid and contributors, under the Apache
      License 2.0, compiled into Tsuzuri as they are released.
    </p>
  </div>
  <div class="flex gap-2">
    <button type="button" class="btn btn-sm" onclick={showLicenses}>
      {t("settings.fullLicenses")}
    </button>
    <button type="button" class="btn btn-sm" onclick={openSource}>
      {t("settings.sourceCode")}
    </button>
    <button type="button" class="btn btn-sm" onclick={openSponsorshipPage}>
      <i data-lucide="heart" class="size-4"></i>
      <span>{t("settings.sponsor")}</span>
    </button>
  </div>
  <dialog class="modal" bind:this={dialog}>
    <div class="modal-box w-11/12 max-w-4xl">
      <h3 class="text-lg font-bold">{t("settings.licenses")}</h3>
      {#if notice}
        <iframe
          class="mt-4 h-[60vh] w-full rounded-box border border-base-300"
          title="LICENSE.html"
          sandbox=""
          srcdoc={notice}
        ></iframe>
      {:else if notice === null}
        <div role="alert" class="alert alert-info mt-4 text-sm">
          {t("settings.licensesMissing")}
        </div>
      {/if}
      <div class="modal-action">
        <form method="dialog">
          <button class="btn">{t("work.close")}</button>
        </form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  </dialog>
</fieldset>
