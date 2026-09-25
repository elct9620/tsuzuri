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
