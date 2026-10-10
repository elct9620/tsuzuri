<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLDialogAttributes } from "svelte/elements";

  interface Props extends HTMLDialogAttributes {
    title: string;
    /** Classes sizing the box, such as `max-w-md`. */
    boxClass?: string;
    /** What the button that closes it reads, or none for a modal only its owner closes. */
    dismissLabel?: string;
    children: Snippet;
    /** The buttons beside the one that closes it. */
    actions?: Snippet;
  }

  let {
    title,
    boxClass,
    dismissLabel,
    children,
    actions,
    ...attributes
  }: Props = $props();
  let dialog: HTMLDialogElement;

  export function showModal(): void {
    dialog.showModal();
  }

  export function close(): void {
    dialog.close();
  }

  export function isOpen(): boolean {
    return dialog.open;
  }
</script>

<dialog class="modal" bind:this={dialog} {...attributes}>
  <div class={["modal-box", boxClass]}>
    <h3 class="mb-2 text-lg font-bold">{title}</h3>
    {@render children()}
    {#if dismissLabel !== undefined}
      <div class="modal-action">
        <form method="dialog">
          <button class="btn">{dismissLabel}</button>
        </form>
        {@render actions?.()}
      </div>
    {/if}
  </div>
  {#if dismissLabel !== undefined}
    <form method="dialog" class="modal-backdrop">
      <button>close</button>
    </form>
  {/if}
</dialog>
