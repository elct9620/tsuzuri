import { Controller } from "@hotwired/stimulus";

import {
  fieldSelection,
  fieldValue,
  insertLineBreak,
  setFieldValue,
  type CursorField,
  type EditingSession,
} from "../editor";
import { notifyEdit } from "../ui/notification";

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

/**
 * One text or translation field of the editor, handing the session what the user does in it:
 * entering it, moving the selection, leaving it or giving up its typing, and splitting its Segment
 * by shortcut.
 */
export default class FieldController extends Controller<HTMLElement> {
  declare readonly session: EditingSession;

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

  enter(): void {
    this.session.enter(
      this.index,
      this.field,
      fieldSelection(this.element),
      fieldValue(this.element),
    );
  }

  /** Follows the selection while the field has focus, as it moves or text is typed. */
  select(): void {
    if (document.activeElement !== this.element) return;
    const range = fieldSelection(this.element);
    if (range)
      this.session.select(
        this.index,
        this.field,
        range,
        fieldValue(this.element),
      );
  }

  /** Keeps a line break as a character of the text rather than as markup; bound with `:!composing:prevent`. */
  breakLine(): void {
    insertLineBreak();
  }

  /** Puts back the text the field was entered with and leaves it, so nothing is written; bound to Esc with `:!composing:prevent`. */
  revert(): void {
    const text = this.session.textAtEntry(this.index, this.field);
    if (text === null) return;
    setFieldValue(this.element, text);
    this.element.blur();
  }

  /** Hands over where the Cursor was left and the text. */
  async leave(): Promise<void> {
    notifyEdit(
      await this.session.leave(
        this.index,
        this.field,
        fieldSelection(this.element),
        fieldValue(this.element),
      ),
    );
  }

  /** Splits the Segment where the Cursor in its text starts; bound to the split shortcuts with `:!composing:prevent`. */
  async split(): Promise<void> {
    this.select();
    notifyEdit(await this.session.split(), { refusal: "edit.splitWhere" });
  }

  private get index(): number {
    return Number(this.element.dataset.index);
  }

  private get field(): CursorField {
    return this.element.dataset.field as CursorField;
  }
}
