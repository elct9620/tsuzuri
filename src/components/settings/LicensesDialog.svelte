<script lang="ts">
  import { t } from "#/i18n.ts";
  import Modal from "#/components/Modal.svelte";

  let dialog: Modal;
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

<Modal
  bind:this={dialog}
  title={t("settings.licenses")}
  boxClass="w-11/12 max-w-4xl"
  dismissLabel={t("work.close")}
>
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
</Modal>
