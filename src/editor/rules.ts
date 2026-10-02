/** The rules an edit follows, apart from any screen. */

import type { SegmentChange, TranscriptView } from "./segment";

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
 * Whether the Mode running on the Current Resource holds a field of `kind` of the Segment at
 * `index`: a transcription or a diarization holds every field, a translation every one but the texts and a
 * translation it does not write, which translating chosen Segments again narrows to theirs.
 */
export function isHeld(
  kind: FieldKind,
  { runningMode, shownTranslation }: TranscriptView,
  index: number,
): boolean {
  if (runningMode === null) return false;
  if (runningMode.mode !== "translation") return true;
  if (kind === "text") return false;
  if (kind !== "translation") return true;
  const { language, indexes } = runningMode;
  return (
    language === shownTranslation &&
    (indexes === null || indexes.includes(index))
  );
}

/** Where a split cuts `text` at `at` characters, or none when one side would be left empty. */
export function splitPoint(text: string, at: number): number | null {
  return at > 0 && at < [...text].length ? at : null;
}

/** How many Segments `count` of them become once `change` is made. */
export function segmentCountAfter(
  change: SegmentChange,
  count: number,
): number {
  switch (change.kind) {
    case "split":
    case "insertion":
    case "insertion-before":
    case "insertion-after":
      return count + 1;
    case "deletion":
      return count - change.indexes.length;
    case "merge":
      return count - (change.last - change.first);
    default:
      return count;
  }
}

/** Which of a Segment's times a time field holds. */
export type TimeEdge = "start" | "end";

/**
 * A Segment's times once `edge` is typed as `start_ms` or `end_ms`: the edge typed past the other
 * carries it along, as Aegisub keeps a line's times in order.
 */
export function orderedTimes(
  edge: TimeEdge,
  start_ms: number,
  end_ms: number,
): { start_ms: number; end_ms: number } {
  return edge === "start"
    ? { start_ms, end_ms: Math.max(start_ms, end_ms) }
    : { start_ms: Math.min(start_ms, end_ms), end_ms };
}
