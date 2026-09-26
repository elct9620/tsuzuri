/** The rules an edit follows, apart from any screen. */

import type { TranscriptView } from "./segment";

/** Whether `indexes`, in order, stand next to each other, as a merge needs. */
export function isRun(indexes: number[]): boolean {
  return (
    indexes.length > 1 &&
    indexes.every(
      (index, position) =>
        position === 0 || index === indexes[position - 1] + 1,
    )
  );
}

/** A field of a row: a text, a translation, or any other such as a time or a Speaker. */
export type FieldKind = "text" | "translation" | "other";

/**
 * Whether the Mode running on the Current Resource holds a field of `kind`: a transcription holds
 * every field, a translation every one but the texts and a translation it does not write.
 */
export function isHeld(
  kind: FieldKind,
  { runningMode, shownTranslation }: TranscriptView,
): boolean {
  if (runningMode === null) return false;
  if (runningMode.mode === "transcription") return true;
  if (kind === "text") return false;
  return kind !== "translation" || runningMode.language === shownTranslation;
}

/** Where a split cuts `text` at `at` characters, or none when one side would be left empty. */
export function splitPoint(text: string, at: number): number | null {
  return at > 0 && at < [...text].length ? at : null;
}
