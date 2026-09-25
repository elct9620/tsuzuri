import { Controller } from "@hotwired/stimulus";

/**
 * One daisyUI tooltip for the whole page, moved beside whichever element with `data-tooltip` the
 * pointer or focus is on. daisyUI draws a tooltip inside its element, where a scrolling list or a
 * dialog cuts it off; this one sits outside them and is placed by the element's position on screen.
 */
export default class TooltipController extends Controller<HTMLElement> {
  static targets = ["bubble"];

  declare readonly bubbleTarget: HTMLElement;

  /** Shows the tip of the element with `data-tooltip` the pointer or focus has come to. */
  show(event: Event): void {
    const trigger = (event.target as Element).closest<HTMLElement>(
      "[data-tooltip]",
    );
    if (trigger) this.place(trigger);
  }

  /** Hides the tip; bound to `scroll` with `:capture`, since a scrolling list does not bubble it. */
  hide(): void {
    this.bubbleTarget.hidden = true;
  }

  private place(trigger: HTMLElement): void {
    const bubble = this.bubbleTarget;
    // An open dialog is drawn above everything outside it.
    const layer = trigger.closest("dialog") ?? this.element;
    if (bubble.parentElement !== layer) layer.append(bubble);
    const { left, top, width, height } = trigger.getBoundingClientRect();
    Object.assign(bubble.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    // Opening away from the nearer window edge keeps the tip on screen.
    const isInRightHalf = left + width / 2 > window.innerWidth / 2;
    bubble.classList.toggle("tooltip-left", isInRightHalf);
    bubble.classList.toggle("tooltip-right", !isInRightHalf);
    bubble.dataset.tip = trigger.dataset.tooltip;
    bubble.hidden = false;
  }
}
