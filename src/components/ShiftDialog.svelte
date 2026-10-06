<!--
  @component
  The shift dialog: moves the Checked Segments earlier or later by the milliseconds typed, as one
  change.
-->
<script lang="ts">
  import { t } from "#/i18n.ts";
  import { notifyEdit } from "#/state/notification.svelte.ts";
  import { editingSession } from "#/state/context.ts";
  import Modal from "#/components/Modal.svelte";

  const session = editingSession();
  let dialog: Modal;
  /** Milliseconds to shift by, negative for earlier. */
  let offsetInput: HTMLInputElement;

  export function open(): void {
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

<Modal
  bind:this={dialog}
  title={t("edit.shiftTitle")}
  boxClass="max-w-sm"
  dismissLabel={t("work.cancel")}
>
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
  {#snippet actions()}
    <button type="button" class="btn btn-primary" onclick={shift}
      >{t("edit.shiftStart")}</button
    >
  {/snippet}
</Modal>
