import { Controller } from "@hotwired/stimulus";

import { fieldValue, insertLineBreak } from "../editor/field";

/**
 * Routes a key event by whether an input method is still composing text: `:composing` routes only
 * those, `:!composing` only the others, so an Enter that picks a candidate stays the input method's.
 */
export function composingOption({
  event,
  value,
}: {
  event: Event;
  value: boolean;
}): boolean {
  return (event instanceof KeyboardEvent && event.isComposing) === value;
}

/** One text field of the editor: hands over its text as `field:change` when it is left changed. */
export default class FieldController extends Controller<HTMLElement> {
  private valueOnEntry = "";

  remember(): void {
    this.valueOnEntry = fieldValue(this.element);
  }

  /** Keeps a line break as a character of the text rather than as markup; bound with `:!composing:prevent`. */
  breakLine(): void {
    insertLineBreak();
  }

  leave(): void {
    const value = fieldValue(this.element);
    if (value === this.valueOnEntry) return;
    this.valueOnEntry = value;
    this.dispatch("change", { detail: { value } });
  }
}
