/** The text the Cursor selects, which the search bar and the replace dialog both look for. */

import type { Cursor } from "../editor";

/** The text of the range `cursor` selects, empty for a caret or no Cursor. */
export function selectedText(cursor: Cursor): string {
  const caret = cursor.caret;
  if (!caret || caret.start === caret.end) return "";
  return [...caret.text].slice(caret.start, caret.end).join("");
}
