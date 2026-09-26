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
  placeSelection,
  setFieldHeld,
  setFieldValue,
} from "./field";
export { hasHighlights, markRanges, textRange } from "./highlight";
export { CURSOR_HIGHLIGHT, drawCursor } from "./marks";
export { isHeld, isRun, type FieldKind } from "./rules";
export type {
  RunningMode,
  Segment,
  SegmentChange,
  SegmentField,
  TranscriptView,
} from "./segment";
export {
  EditingSession,
  type EditingPort,
  type Outcome,
  type SessionChange,
} from "./session";
