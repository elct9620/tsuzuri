<script lang="ts">
  import { t } from "#/i18n.ts";

  let dialog: HTMLDialogElement;
  /** The License Notice, read the first time the dialog opens; null for a build without one. */
  let notice = $state<string | null>();

  export async function open(): Promise<void> {
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
</script>

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
