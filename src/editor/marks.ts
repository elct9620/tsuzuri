/**
 * Draws the Cursor in the field that holds it: a caret of its own, or a range marked through the
 * CSS Custom Highlight API. The page hides the platform's caret and selection in fields, so the
 * Cursor looks the same with focus or without, and a kept one only stops blinking.
 */

import type { KeptCaret, LiveCaret } from "./cursor";
import { rangeOf } from "./field";
import { markRanges } from "./highlight";

/** The highlight a range of the Cursor is marked under, which the page colours. */
export const CURSOR_HIGHLIGHT = "cursor";

const CARET_CLASS =
  "cursor-caret pointer-events-none absolute w-0.5 bg-base-content";

/** The field the Cursor is drawn in, watched so the caret follows the text as it is laid out again. */
let drawn: {
  field: HTMLElement;
  caret: LiveCaret | KeptCaret;
  observer?: ResizeObserver;
} | null = null;

/** Draws `caret` in `field`, taking away the Cursor drawn before; nothing is drawn without either. */
export function drawCursor(
  field: HTMLElement | null,
  caret: LiveCaret | KeptCaret | null,
): void {
  eraseCursor();
  if (!field || !caret) return;
  const isRange = caret.start !== caret.end;
  field.dataset.cursor = isRange
    ? `${caret.start}-${caret.end}`
    : `${caret.start}`;
  field.toggleAttribute("data-cursor-kept", caret.kind === "kept");
  drawn = { field, caret };
  if (isRange) {
    markRanges(CURSOR_HIGHLIGHT, [rangeOf(field, caret)]);
    return;
  }
  placeCaretMark(field, caret);
  if (typeof ResizeObserver !== "undefined") {
    drawn.observer = new ResizeObserver(() => placeCaretMark(field, caret));
    drawn.observer.observe(field);
  }
}

function eraseCursor(): void {
  if (!drawn) return;
  drawn.observer?.disconnect();
  delete drawn.field.dataset.cursor;
  drawn.field.removeAttribute("data-cursor-kept");
  drawn.field.parentElement?.querySelector(":scope > .cursor-caret")?.remove();
  markRanges(CURSOR_HIGHLIGHT, []);
  drawn = null;
}

/**
 * Sets the caret beside the character it stands after, within the field's parent, which the page
 * positions; an empty field has no character, so the caret stands where its text would begin.
 */
function placeCaretMark(
  field: HTMLElement,
  caret: LiveCaret | KeptCaret,
): void {
  const host = field.parentElement;
  if (!host) return;
  let mark = host.querySelector<HTMLElement>(":scope > .cursor-caret");
  if (!mark) {
    mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    host.append(mark);
  }
  mark.className = `${CARET_CLASS} ${caret.kind === "live" ? "animate-blink" : ""}`;
  const at = rangeOf(field, caret).getBoundingClientRect();
  const box = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const hasPlace = at.height > 0;
  const left = hasPlace ? at.left : box.left + parseFloat(style.paddingLeft);
  const top = hasPlace ? at.top : box.top + parseFloat(style.paddingTop);
  const hostBox = host.getBoundingClientRect();
  mark.style.left = `${left - hostBox.left}px`;
  mark.style.top = `${top - hostBox.top}px`;
  mark.style.height = `${hasPlace ? at.height : parseFloat(style.lineHeight) || box.height}px`;
}
