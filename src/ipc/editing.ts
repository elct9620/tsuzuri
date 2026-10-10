/**
 * The editor's way to Rust: the only place the editing commands are called, as the port the
 * editing session writes through, and the Project turned into the Transcript the editor edits.
 */

import type {
  EditingPort,
  Segment as EditorSegment,
  TranscriptView,
} from "#/editor/index.ts";
import type { ProjectView, Segment } from "#/ipc/project.ts";
import type * as bindings from "#/ipc/bindings.ts";
import { commands } from "#/ipc/bindings.ts";

export type SegmentField = bindings.SegmentField;

export type SegmentChange = bindings.SegmentChange;

export type Search = bindings.Search;

export type TextMatch = bindings.TextMatch;

/** Where `search` matches `field` of each Segment of the Current Resource, in order. */
export function findText(
  field: "text" | "translation",
  search: Search,
): Promise<TextMatch[]> {
  return commands.findText(field, search);
}

export const editingPort: EditingPort = {
  editSegment: async (index, field: SegmentField, value) => {
    await commands.editSegment(index, field, value);
  },
  setSpeakers: async (indexes, speaker) => {
    await commands.setSpeakers(indexes, speaker);
  },
  changeSegments: async (change: SegmentChange) => {
    await commands.changeSegments(change);
  },
  replaceText: (field, replacement) => commands.replaceText(field, replacement),
  cleanSimplified: (scope) => commands.cleanSimplified(scope),
  undo: async () => {
    await commands.undo();
  },
  redo: async () => {
    await commands.redo();
  },
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
