/**
 * The choice between a Segment's original and its translation, and the text the Cursor selects,
 * as the search bar and the replace dialog both offer them.
 */

import type { Cursor, CursorField } from "../editor";

/** The text of the range `cursor` selects, empty for a caret or no Cursor. */
export function selectedText(cursor: Cursor): string {
  const caret = cursor.caret;
  if (!caret || caret.start === caret.end) return "";
  return [...caret.text].slice(caret.start, caret.end).join("");
}

/**
 * Offers the translation among `choices` only while one is shown, choosing the original when the
 * choice made is no longer offered.
 */
export function offerTextFields(
  choices: HTMLInputElement[],
  hasTranslation: boolean,
): void {
  for (const choice of choices)
    choice.disabled = choice.value === "translation" && !hasTranslation;
  if (choices.some((choice) => choice.checked && !choice.disabled)) return;
  for (const choice of choices) choice.checked = choice.value === "text";
}

/** The field `choices` has chosen, the original when none is. */
export function chosenTextField(choices: HTMLInputElement[]): CursorField {
  return (choices.find((choice) => choice.checked)?.value ??
    "text") as CursorField;
}
