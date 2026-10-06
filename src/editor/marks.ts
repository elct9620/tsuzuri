/**
 * Where the Cursor is drawn in the field that holds it: a caret of its own, or a range marked
 * through the CSS Custom Highlight API. The page hides the platform's caret and selection in fields,
 * so the Cursor looks the same with focus or without, and a kept one only stops blinking.
 */

import type { KeptCaret, LiveCaret } from "./cursor";
import { rangeOf } from "./field";

/** The highlight a range of the Cursor is marked under, which the page colours. */
export const CURSOR_HIGHLIGHT = "cursor";

/** Where a caret stands within its field's parent, in pixels. */
export interface CaretPlace {
  left: number;
  top: number;
  height: number;
}

/** What `data-cursor` says of `caret`: where it stands, or the range it covers. */
export function cursorMark({ start, end }: LiveCaret | KeptCaret): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

/**
 * Where `caret` stands within `field`'s parent, which the page positions: beside the character it
 * stands after, or where the text would begin in an empty field. None while the field has no parent.
 */
export function caretPlace(
  field: HTMLElement,
  caret: LiveCaret | KeptCaret,
): CaretPlace | null {
  const host = field.parentElement;
  if (!host) return null;
  const at = rangeOf(field, caret).getBoundingClientRect();
  const box = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const hasPlace = at.height > 0;
  const left = hasPlace ? at.left : box.left + parseFloat(style.paddingLeft);
  const top = hasPlace ? at.top : box.top + parseFloat(style.paddingTop);
  const hostBox = host.getBoundingClientRect();
  return {
    left: left - hostBox.left,
    top: top - hostBox.top,
    height: hasPlace ? at.height : parseFloat(style.lineHeight) || box.height,
  };
}
