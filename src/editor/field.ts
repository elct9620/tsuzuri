/**
 * A text field for one text of a cue: a plain-text `contenteditable` element whose value is its
 * text, line breaks included. It knows nothing of Stimulus or Tauri, so any controller can use it.
 */

import type { TextRange } from "./cursor";

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

/** The input types holding typed text, whose own history an undo or a select all in them belongs to. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "tel",
  "number",
]);

/** Whether `element` holds typed text of its own: a field, or an input of a text type. */
export function isTextField(element: EventTarget | null): boolean {
  return (
    isField(element) ||
    (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type))
  );
}

/** The text the field holds. */
export function fieldValue(field: HTMLElement): string {
  return field.textContent ?? "";
}

/** Replaces the field's text. */
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

/** How many characters of the field come before `node` at `offset`. */
function offsetOf(field: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(field);
  before.setEnd(node, offset);
  return [...before.toString()].length;
}

/** The part of the document's selection within the field, or none when the selection is elsewhere. */
export function fieldSelection(field: HTMLElement): TextRange | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !field.contains(range.startContainer) ||
    !field.contains(range.endContainer)
  )
    return null;
  return {
    start: offsetOf(field, range.startContainer, range.startOffset),
    end: offsetOf(field, range.endContainer, range.endOffset),
  };
}

/** Where `at` characters into the field fall in its DOM, past its end when the text is shorter. */
function boundaryAt(field: HTMLElement, at: number): [Node, number] {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let left = at;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const characters = [...(node.textContent ?? "")];
    if (left <= characters.length)
      return [node, characters.slice(0, left).join("").length];
    left -= characters.length;
  }
  return [field, field.childNodes.length];
}

/** The DOM Range covering characters `start` to `end` of the field. */
export function rangeOf(field: HTMLElement, { start, end }: TextRange): Range {
  const range = document.createRange();
  range.setStart(...boundaryAt(field, start));
  range.setEnd(...boundaryAt(field, end));
  return range;
}

/** Selects characters `start` to `end` of the field, as the caret or range the user would see. */
export function placeSelection(field: HTMLElement, textRange: TextRange): void {
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(rangeOf(field, textRange));
}

/**
 * Types a line break at the caret through the platform's editing, so the field's own undo takes it
 * back; `insertLineBreak` keeps it a `\n` in the text, where typing Enter splits the text into blocks.
 */
export function insertLineBreak(): void {
  document.execCommand("insertLineBreak");
}
