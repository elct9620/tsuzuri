import { Controller } from "@hotwired/stimulus";

/**
 * One daisyUI tooltip for the whole page, moved beside whichever element with `data-tooltip` the
 * pointer or focus is on. daisyUI draws a tooltip inside its element, where a scrolling list or a
 * dialog cuts it off; this one sits outside them and is placed by the element's position on screen.
 */
export default class TooltipController extends Controller<HTMLElement> {
  static targets = ["bubble"];

  declare readonly bubbleTarget: HTMLElement;

  private readonly showFor = (event: Event) => {
    const trigger = (event.target as Element).closest<HTMLElement>(
      "[data-tooltip]",
    );
    if (trigger) this.show(trigger);
  };

  private readonly hide = () => {
    this.bubbleTarget.hidden = true;
  };

  /** Each event with what it does, capturing `scroll` since a scrolling list does not bubble it. */
  private readonly listeners: [string, EventListener, boolean][] = [
    ["pointerover", this.showFor, false],
    ["focusin", this.showFor, false],
    ["pointerout", this.hide, false],
    ["focusout", this.hide, false],
    ["scroll", this.hide, true],
  ];

  connect(): void {
    for (const [event, listener, isCapture] of this.listeners)
      this.element.addEventListener(event, listener, isCapture);
  }

  disconnect(): void {
    for (const [event, listener, isCapture] of this.listeners)
      this.element.removeEventListener(event, listener, isCapture);
  }

  private show(trigger: HTMLElement): void {
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
    bubble.dataset.tip = trigger.dataset.tooltip;
    bubble.hidden = false;
  }
}
