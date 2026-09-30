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
import type * as bindings from "./bindings";

export type SegmentField = bindings.SegmentField;

export type SegmentChange = bindings.SegmentChange;

export type Search = bindings.Search;

export type TextMatch = bindings.TextMatch;

/** Where `search` matches `field` of each Segment of the Current Resource, in order. */
export function findText(
  field: "text" | "translation",
  search: Search,
): Promise<TextMatch[]> {
  return invoke<TextMatch[]>("find_text", { field, search });
}

export const editingPort: EditingPort = {
  editSegment: (index, field: SegmentField, value) =>
    invoke("edit_segment", { index, field, value }),
  setSpeakers: (indexes, speaker) =>
    invoke("set_speakers", { indexes, speaker }),
  changeSegments: (change: SegmentChange) =>
    invoke("change_segments", { change }),
  replaceText: (field, replacement) =>
    invoke<number>("replace_text", { field, replacement }),
  cleanSimplified: (scope) => invoke<number>("clean_simplified", { scope }),
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
