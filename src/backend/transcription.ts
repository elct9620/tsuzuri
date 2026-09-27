import { invoke } from "@tauri-apps/api/core";

import type { PhaseTiming } from "./progress";
import type { SegmentSpan } from "./project";

export interface Transcription {
  audio_seconds: number;
  transcribe_seconds: number;
  phases: PhaseTiming[];
  /** The positions of the Segments written within an Audio Window, none for the whole media file. */
  written_span: SegmentSpan | null;
}

/** Which Segments a transcription replaces, by the positions the Current Resource shows. */
export type TranscriptionScope =
  | { kind: "whole" }
  | { kind: "rest"; first: number }
  | ({ kind: "span" } & SegmentSpan);

/** Transcribes the Current Resource's media file within `scope`, over its original subtitle only when `overwrite`. */
export function transcribe(
  overwrite: boolean,
  scope: TranscriptionScope = { kind: "whole" },
): Promise<Transcription> {
  return invoke<Transcription>("transcribe", { overwrite, scope });
}

/** How whisper-cli transcribes beyond the Language and the Model. */
export interface TranscriptionSettings {
  has_vad: boolean;
  is_non_speech_suppressed: boolean;
  /** Whether each window carries the text before it as context. */
  is_context_carried: boolean;
}

export function transcriptionSettings(): Promise<TranscriptionSettings> {
  return invoke<TranscriptionSettings>("transcription_settings");
}

export function saveTranscriptionSettings(
  settings: TranscriptionSettings,
): Promise<TranscriptionSettings> {
  return invoke<TranscriptionSettings>("save_transcription_settings", {
    settings,
  });
}
