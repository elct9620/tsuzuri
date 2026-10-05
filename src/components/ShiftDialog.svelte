<!--
  @component
  The shift dialog: moves the Checked Segments earlier or later by the milliseconds typed, as one
  change. The checked bar opens it by `segment-changes:shift` on the window.
-->
<script lang="ts">
  import { t } from "../i18n";
  import { notifyEdit } from "../ui/notification.svelte";
  import { editingSession } from "./context";

  const session = editingSession();
  let dialog: HTMLDialogElement;
  /** Milliseconds to shift by, negative for earlier. */
  let offsetInput: HTMLInputElement;

  function open(): void {
    offsetInput.value = "0";
    dialog.showModal();
  }

  /** Shifts the Segments checked now, keeping the dialog open while the offset is empty. */
  async function shift(): Promise<void> {
    const indexes = session.checkedIndexes;
    const offset = offsetInput.valueAsNumber;
    if (Number.isNaN(offset)) {
      offsetInput.reportValidity();
      return;
    }
    dialog.close();
    if (indexes.length === 0) return;
    notifyEdit(
      await session.change({
        kind: "shift",
        first: indexes[0],
        last: indexes[indexes.length - 1],
        offset_ms: Math.round(offset),
      }),
    );
  }
</script>

<svelte:window onsegment-changes:shift={open} />

<dialog class="modal" bind:this={dialog}>
  <div class="modal-box max-w-sm">
    <h3 class="mb-2 text-lg font-bold">{t("edit.shiftTitle")}</h3>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">{t("edit.offset")}</legend>
      <input
        type="number"
        step="100"
        required
        class="input validator w-full"
        aria-label={t("edit.offset")}
        bind:this={offsetInput}
      />
    </fieldset>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn">{t("work.cancel")}</button>
      </form>
      <button type="button" class="btn btn-primary" onclick={shift}
        >{t("edit.shiftStart")}</button
      >
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
