import { Controller } from "@hotwired/stimulus";

import { fieldValue, insertLineBreak, keepSelection } from "../editor/field";

/**
 * Routes a key event by whether an input method is still composing text: `:composing` routes only
 * those, `:!composing` only the others, so an Enter that picks a candidate stays the input method's.
 * A key the input method is still processing reports `keyCode` 229, and WebKit ends a composition
 * before the key that ends it arrives (WebKit bug 165004), which the field's own state covers.
 */
export function composingOption({
  event,
  value,
  controller,
}: {
  event: Event;
  value: boolean;
  controller: Controller;
}): boolean {
  const isComposing =
    (event instanceof KeyboardEvent &&
      (event.isComposing || event.keyCode === 229)) ||
    (controller instanceof FieldController && controller.isComposing);
  return isComposing === value;
}

/** One text field of the editor: hands over its text as `field:change` when it is left changed, and keeps its selection. */
export default class FieldController extends Controller<HTMLElement> {
  private valueOnEntry = "";
  private hasComposition = false;

  /** Whether an input method is composing, or has only just ended composing, in the field. */
  get isComposing(): boolean {
    return this.hasComposition;
  }

  startComposing(): void {
    this.hasComposition = true;
  }

  /** Stays composing until the next task, so the key that ended the composition still counts as its. */
  endComposing(): void {
    setTimeout(() => (this.hasComposition = false), 0);
  }

  remember(): void {
    this.valueOnEntry = fieldValue(this.element);
  }

  /** Keeps a line break as a character of the text rather than as markup; bound with `:!composing:prevent`. */
  breakLine(): void {
    insertLineBreak();
  }

  /** Keeps where the selection was, which a click elsewhere moves away, and hands over the text if it changed. */
  leave(): void {
    keepSelection(this.element);
    const value = fieldValue(this.element);
    if (value === this.valueOnEntry) return;
    this.valueOnEntry = value;
    this.dispatch("change", { detail: { value } });
  }
}
