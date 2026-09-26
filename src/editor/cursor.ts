/**
 * The Current Segment and the Cursor as one state machine: which Segment is current, and where
 * editing stands in it. It knows nothing of the DOM, so each step can be checked on its own.
 */

import { isHeld } from "./rules";
import type { Segment, SegmentChange, TranscriptView } from "./segment";

/** The fields that hold a Cursor; a time or a Speaker makes its Segment current without one. */
export type CursorField = "text" | "translation";

/** A stretch of a field's text, counted in characters; a caret starts where it ends. */
export interface TextRange {
  start: number;
  end: number;
}

/** A caret or range in the field that has focus, with the text it stands in. */
export interface LiveCaret extends TextRange {
  kind: "live";
  field: CursorField;
  text: string;
}

/** A caret or range kept once focus left its field, for a menu chosen afterwards. */
export interface KeptCaret extends TextRange {
  kind: "kept";
  field: CursorField;
  text: string;
}

export interface Cursor {
  /** The Current Segment's position, or none. */
  index: number | null;
  /** Where editing stands in the Current Segment, or nowhere. */
  caret: LiveCaret | KeptCaret | null;
}

export const NO_CURSOR: Cursor = { index: null, caret: null };

/** What moves the Cursor: the user in a row, a Segment Change the editor made, or a Transcript changed elsewhere. */
export type CursorEvent =
  | {
      kind: "entry";
      index: number;
      /** The field entered, or none for a time or a Speaker. */
      field: CursorField | null;
      range: TextRange | null;
      text: string;
    }
  | { kind: "selection"; range: TextRange; text: string }
  | { kind: "exit"; range: TextRange | null; text: string }
  /** The typing in the live caret's field given up, which leaves no place in the text to keep. */
  | { kind: "reversion" }
  | { kind: "current-segment"; index: number }
  | { kind: "change"; change: SegmentChange; before: Segment[] }
  | { kind: "view"; before: TranscriptView | null; after: TranscriptView };

/** A caret at `start` of the text of a Segment just made, to type into at once. */
function caretAt(start: number, text: string): LiveCaret {
  return { kind: "live", field: "text", start, end: start, text };
}

/** The Cursor after `event`. */
export function nextCursor(cursor: Cursor, event: CursorEvent): Cursor {
  switch (event.kind) {
    case "entry":
      if (event.field === null)
        return event.index === cursor.index
          ? cursor
          : { index: event.index, caret: null };
      return {
        index: event.index,
        caret: {
          kind: "live",
          field: event.field,
          ...(event.range ?? { start: 0, end: 0 }),
          text: event.text,
        },
      };
    case "selection":
      if (cursor.caret?.kind !== "live") return cursor;
      return {
        ...cursor,
        caret: { ...cursor.caret, ...event.range, text: event.text },
      };
    case "exit":
      if (cursor.caret?.kind !== "live") return cursor;
      return {
        ...cursor,
        caret: {
          ...cursor.caret,
          ...event.range,
          kind: "kept",
          text: event.text,
        },
      };
    case "reversion":
      return cursor.caret?.kind === "live"
        ? { ...cursor, caret: null }
        : cursor;
    case "current-segment":
      return event.index === cursor.index
        ? cursor
        : { index: event.index, caret: null };
    case "change":
      return cursorAfterChange(cursor, event.change, event.before);
    case "view":
      return cursorAfterView(cursor, event.before, event.after);
  }
}

/**
 * Where the Cursor stands once the editor's own `change` is made to `before`: it stays on its
 * Segment, moves to the second half of a split and into a Segment just inserted.
 */
function cursorAfterChange(
  cursor: Cursor,
  change: SegmentChange,
  before: Segment[],
): Cursor {
  const { index } = cursor;
  switch (change.kind) {
    case "split":
      if (index === change.index)
        return {
          index: index + 1,
          caret: caretAt(0, [...before[index].text].slice(change.at).join("")),
        };
      return index !== null && index > change.index
        ? { ...cursor, index: index + 1 }
        : cursor;
    case "insertion-before":
      return { index: change.index, caret: caretAt(0, "") };
    case "insertion-after":
      return { index: change.index + 1, caret: caretAt(0, "") };
    case "insertion":
      return {
        index: before.filter((segment) => segment.start_ms < change.start_ms)
          .length,
        caret: caretAt(0, ""),
      };
    case "deletion": {
      if (index === null) return cursor;
      const deletedIndexes = new Set(change.indexes);
      const indexAfter = (at: number) =>
        at - change.indexes.filter((each) => each < at).length;
      if (!deletedIndexes.has(index))
        return { ...cursor, index: indexAfter(index) };
      for (let at = index + 1; at < before.length; at++)
        if (!deletedIndexes.has(at))
          return { index: indexAfter(at), caret: null };
      for (let at = index - 1; at >= 0; at--)
        if (!deletedIndexes.has(at))
          return { index: indexAfter(at), caret: null };
      return NO_CURSOR;
    }
    case "merge":
      if (index === null || index < change.first) return cursor;
      if (index <= change.last) return { index: change.first, caret: null };
      return { ...cursor, index: index - (change.last - change.first) };
    default:
      return cursor;
  }
}

/**
 * Where the Cursor stands once the Transcript changed by other means: kept while the Segments keep
 * their number, dropped with the Resource or a change in number, and a kept caret dropped once its
 * text is replaced or a Mode holds its field.
 */
function cursorAfterView(
  cursor: Cursor,
  before: TranscriptView | null,
  after: TranscriptView,
): Cursor {
  if (cursor.index === null) return cursor;
  const isSameShape =
    before !== null &&
    before.resource === after.resource &&
    before.segments.length === after.segments.length;
  const segment = after.segments[cursor.index];
  if (!isSameShape || !segment) return NO_CURSOR;
  const { caret } = cursor;
  if (caret === null) return cursor;
  const isReplaced =
    caret.kind === "kept" && (segment[caret.field] ?? "") !== caret.text;
  return isReplaced || isHeld(caret.field, after, cursor.index)
    ? { ...cursor, caret: null }
    : cursor;
}
