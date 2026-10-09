/**
 * A text field for one text of a cue: a plain-text `contenteditable` element whose value is its
 * text, line breaks included. It knows nothing of the page's framework or Tauri, so the editor
 * stays apart from both.
 */

import type { TextRange } from "./cursor";

const EDITABLE = "plaintext-only";

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

/**
 * Where in `field`'s text the point `x`, `y` of the viewport falls, counted in UTF-16 units as the
 * Glossary Marks count, or none when the point is outside its text.
 */
export function offsetAtPoint(
  field: HTMLElement,
  x: number,
  y: number,
): number | null {
  const position = pointPosition(x, y);
  if (!position || !field.contains(position.node)) return null;
  const before = document.createRange();
  before.selectNodeContents(field);
  before.setEnd(position.node, position.offset);
  return before.toString().length;
}

/** The text position at `x`, `y`, through the standard lookup or WebKit's older one. */
function pointPosition(
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  // Older WebKit has only caretRangeFromPoint, its own earlier form of the lookup
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range && { node: range.startContainer, offset: range.startOffset };
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

/**
 * Where `at` characters into the field fall in its DOM, past its end when the text is shorter. Typing
 * splits the text into several nodes, and where two meet the place is taken at the start of the later
 * one, as the platform places a caret: the end of a line break's own node lays out on the line it ends.
 */
function boundaryAt(field: HTMLElement, at: number): [Node, number] {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let left = at;
  let end: [Node, number] | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const characters = [...text];
    if (left < characters.length)
      return [node, characters.slice(0, left).join("").length];
    left -= characters.length;
    if (left === 0) end = [node, text.length];
  }
  return end ?? [field, field.childNodes.length];
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
