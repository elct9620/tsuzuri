/**
 * A text field for one text of a cue: a plain-text `contenteditable` element whose value is its
 * text, line breaks included. It knows nothing of Stimulus or Tauri, so any controller can use it.
 */

const EDITABLE = "plaintext-only";

/** A new field holding `value`, showing `placeholder` while it is empty. */
export function createField(value: string, placeholder = ""): HTMLElement {
  const field = document.createElement("div");
  field.setAttribute("contenteditable", EDITABLE);
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-multiline", "true");
  if (placeholder) field.dataset.placeholder = placeholder;
  field.textContent = value;
  return field;
}

/** Whether `element` is a field, held or not, which keeps its own typing history. */
export function isField(element: EventTarget | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.getAttribute("role") === "textbox" &&
    element.hasAttribute("contenteditable")
  );
}

/** The text the field holds. */
export function fieldValue(field: HTMLElement): string {
  return field.textContent ?? "";
}

export function setFieldValue(field: HTMLElement, value: string): void {
  field.textContent = value;
}

/** Stops or lets the user type into the field, as `disabled` does for a form control. */
export function setFieldHeld(field: HTMLElement, isHeld: boolean): void {
  field.setAttribute("contenteditable", isHeld ? "false" : EDITABLE);
  field.setAttribute("aria-disabled", String(isHeld));
}

/** Whether the field is held from typing. */
export function isFieldHeld(field: HTMLElement): boolean {
  return field.getAttribute("contenteditable") === "false";
}

/** How many characters come before the caret in the field, or all of them when the caret is elsewhere. */
export function caretOffset(field: HTMLElement): number {
  const text = fieldValue(field);
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return [...text].length;
  const caret = selection.getRangeAt(0);
  if (!field.contains(caret.endContainer)) return [...text].length;
  const before = document.createRange();
  before.selectNodeContents(field);
  before.setEnd(caret.endContainer, caret.endOffset);
  return [...before.toString()].length;
}

/**
 * Types a line break at the caret through the platform's editing, so the field's own undo takes it
 * back; `insertLineBreak` keeps it a `\n` in the text, where typing Enter splits the text into blocks.
 */
export function insertLineBreak(): void {
  document.execCommand("insertLineBreak");
}
