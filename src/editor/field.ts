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

/** Where a selection in a field starts and ends, counted in characters; a caret starts where it ends. */
export interface FieldSelection {
  start: number;
  end: number;
}

/** The selection each field held when it was last left, as a textarea keeps its own. */
const keptSelections = new WeakMap<HTMLElement, FieldSelection>();

/** Replaces the field's text; a different text drops the selection it kept, as a textarea's value does. */
export function setFieldValue(field: HTMLElement, value: string): void {
  if (value !== fieldValue(field)) keptSelections.delete(field);
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

/** How many characters of the field come before `node` at `offset`. */
function offsetOf(field: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(field);
  before.setEnd(node, offset);
  return [...before.toString()].length;
}

/** The part of the document's selection within the field, or nothing when the selection is elsewhere. */
function liveSelection(field: HTMLElement): FieldSelection | undefined {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (
    !field.contains(range.startContainer) ||
    !field.contains(range.endContainer)
  )
    return undefined;
  return {
    start: offsetOf(field, range.startContainer, range.startOffset),
    end: offsetOf(field, range.endContainer, range.endOffset),
  };
}

/**
 * The field's selection: the one it holds now, or else the one it held when last left, or else a
 * caret after its text. The document has one selection, which a click elsewhere moves away, so a
 * menu chosen after leaving the field still finds where the user was.
 */
export function fieldSelection(field: HTMLElement): FieldSelection {
  const length = [...fieldValue(field)].length;
  return (
    liveSelection(field) ??
    keptSelections.get(field) ?? { start: length, end: length }
  );
}

/** Keeps the field's selection for `fieldSelection` once the document's moves elsewhere; called as the field is left. */
export function keepSelection(field: HTMLElement): void {
  const selection = liveSelection(field);
  if (selection) keptSelections.set(field, selection);
  else keptSelections.delete(field);
}

/**
 * Types a line break at the caret through the platform's editing, so the field's own undo takes it
 * back; `insertLineBreak` keeps it a `\n` in the text, where typing Enter splits the text into blocks.
 */
export function insertLineBreak(): void {
  document.execCommand("insertLineBreak");
}
