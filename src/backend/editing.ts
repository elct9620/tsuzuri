/**
 * The editor's way to Rust: the only place the editing commands are called, as the port the
 * editing session writes through, and the Project turned into the Transcript the editor edits.
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  EditingPort,
  Segment as EditorSegment,
  TranscriptView,
} from "../editor";
import type { ProjectView, Segment } from "./project";

/** Which text of a Segment an edit replaces. */
export type SegmentField = "text" | "translation" | "speaker";

/** A change to the Segments themselves, named as Rust names it. */
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

export const editingPort: EditingPort = {
  editSegment: (index, field: SegmentField, value) =>
    invoke("edit_segment", { index, field, value }),
  setSpeakers: (indexes, speaker) =>
    invoke("set_speakers", { indexes, speaker }),
  changeSegments: (change: SegmentChange) =>
    invoke("change_segments", { change }),
  replaceText: (field, replacement) =>
    invoke<number>("replace_text", { field, replacement }),
  undo: () => invoke("undo"),
  redo: () => invoke("redo"),
};

function editorSegment({
  start_ms,
  end_ms,
  speaker,
  text,
  translation,
}: Segment): EditorSegment {
  return { start_ms, end_ms, speaker, text, translation };
}

/** The Current Resource's Transcript as the editor edits it, empty before a Project is open. */
export function transcriptView(project: ProjectView | null): TranscriptView {
  return {
    resource: project?.current_resource ?? null,
    segments: (project?.segments ?? []).map(editorSegment),
    shownTranslation: project?.shown_translation ?? null,
    runningMode: project?.running_mode ?? null,
  };
}
