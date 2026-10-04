/**
 * The subtitles as the editor edits them. The editor owns these types rather than taking them from
 * the backend, so it depends on nothing outside itself; `backend/editing.ts` converts to them.
 */

export interface Segment {
  start_ms: number;
  end_ms: number;
  speaker?: string;
  text: string;
  translation?: string;
}

/** Which text of a Segment an edit replaces. */
export type SegmentField = "text" | "translation" | "speaker";

/** What to look for in the texts and what to put in its place; Rust reads the pattern. */
export interface Replacement {
  pattern: string;
  /** Put in place of each match; groups of a regular expression are `$1` or `${name}`. */
  substitute: string;
  /** Whether `pattern` is a regular expression of the `regex` crate rather than text taken as written. */
  is_regex: boolean;
}

/**
 * Where a Simplified Cleanup cleans the `zh-TW` text: the Segments at `indexes`, or characters
 * `start` to `end` of one field of the Segment at `index`, counted in characters.
 */
export type CleanupScope =
  | { kind: "segments"; indexes: number[] }
  | {
      kind: "range";
      index: number;
      field: "text" | "translation";
      start: number;
      end: number;
    };

/** A change to the Segments themselves rather than to a text. */
export type SegmentChange =
  | { kind: "times"; index: number; start_ms: number; end_ms: number }
  | { kind: "boundary"; index: number; at_ms: number }
  | { kind: "insertion"; start_ms: number; end_ms: number }
  | { kind: "insertion-before"; index: number }
  | { kind: "insertion-after"; index: number }
  | { kind: "deletion"; indexes: number[] }
  | { kind: "split"; index: number; at: number }
  | { kind: "merge"; first: number; last: number }
  | { kind: "shift"; first: number; last: number; offset_ms: number };

/** The Mode running on the Current Resource, holding the subtitles it writes. */
export type RunningMode =
  | { mode: "transcription" }
  | { mode: "diarization" }
  | { mode: "translation"; language: string; indexes: number[] | null };

/** The Current Resource's Transcript as the editor edits it. */
export interface TranscriptView {
  resource: string | null;
  segments: Segment[];
  /** The Language of the translations the Segments carry, or none. */
  shownTranslation: string | null;
  runningMode: RunningMode | null;
}
