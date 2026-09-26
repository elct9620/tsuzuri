import { invoke } from "@tauri-apps/api/core";

import type { PhaseTiming } from "./progress";

export interface Transcription {
  audio_seconds: number;
  transcribe_seconds: number;
  phases: PhaseTiming[];
}

/** Transcribes the Current Resource's media file, over its original subtitle only when `overwrite`. */
export function transcribe(overwrite: boolean): Promise<Transcription> {
  return invoke<Transcription>("transcribe", { overwrite });
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
