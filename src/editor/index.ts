/**
 * The editor's only entry: the editing session and its types, the rules an edit follows, and the
 * fields and marks it draws. Nothing outside `editor/` reaches past this file.
 */

export {
  NO_CURSOR,
  type Cursor,
  type CursorField,
  type KeptCaret,
  type LiveCaret,
  type TextRange,
} from "./cursor";
export {
  createField,
  fieldSelection,
  fieldValue,
  insertLineBreak,
  isField,
  isFieldHeld,
  isTextField,
  placeSelection,
  rangeOf,
  setFieldHeld,
  setFieldValue,
} from "./field";
export { hasHighlights, markRanges, textRange } from "./highlight";
export { CURSOR_HIGHLIGHT, drawCursor } from "./marks";
export {
  isHeld,
  isRun,
  orderedTimes,
  runWithNeighbour,
  type FieldKind,
  type MergeDirection,
  type TimeEdge,
} from "./rules";
export type {
  CleanupScope,
  Replacement,
  RunningMode,
  Segment,
  SegmentChange,
  SegmentField,
  TranscriptView,
} from "./segment";
export {
  EditingSession,
  type EditingPort,
  type CleanupOutcome,
  type Outcome,
  type ReplacementOutcome,
  type ChoiceSource,
  type SessionChange,
} from "./session";
