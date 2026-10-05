/**
 * The top layer for tests: happy-dom has no Popover API and keeps no top layer, so popovers and
 * modal dialogs are put in one list here, the last drawn above the rest, as a browser stacks them.
 */

const layer: Element[] = [];

/** Takes `element` out of the top layer, wherever it is. */
function leaveTopLayer(element: Element): void {
  const index = layer.indexOf(element);
  if (index >= 0) layer.splice(index, 1);
}

/** Puts `element` on top of the top layer. */
function enterTopLayer(element: Element): void {
  leaveTopLayer(element);
  layer.push(element);
}

/** The elements in the top layer now, the one drawn above the rest last. */
export function topLayer(): Element[] {
  return [...layer];
}

/** Gives elements `showPopover` and `hidePopover`, and has modal dialogs enter the same top layer. */
export function installTopLayer(): void {
  const { showModal, close } = HTMLDialogElement.prototype;
  Object.assign(HTMLElement.prototype, {
    // A popover already shown stays where it is, as a browser leaves it.
    showPopover(this: HTMLElement) {
      if (!layer.includes(this)) enterTopLayer(this);
    },
    hidePopover(this: HTMLElement) {
      leaveTopLayer(this);
    },
  });
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      showModal.call(this);
      enterTopLayer(this);
    },
    close(this: HTMLDialogElement, returnValue?: string) {
      close.call(this, returnValue);
      leaveTopLayer(this);
    },
  });
}
