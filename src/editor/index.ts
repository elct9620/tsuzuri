/**
 * The editor's only entry: the editing session and its types, the rules an edit follows, the
 * fields it reads and where it places the Cursor. Nothing outside `editor/` reaches past this file.
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
  fieldSelection,
  fieldValue,
  insertLineBreak,
  isField,
  isFieldHeld,
  isTextField,
  offsetAtPoint,
  placeSelection,
  rangeOf,
  setFieldHeld,
  setFieldValue,
} from "./field";
export { hasHighlights, markRanges, textRange } from "./highlight";
export {
  CURSOR_HIGHLIGHT,
  type CaretPlace,
  caretPlace,
  cursorMark,
} from "./marks";
export {
  areTimesHeld,
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
