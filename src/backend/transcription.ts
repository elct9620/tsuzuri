import { invoke } from "@tauri-apps/api/core";

import type * as bindings from "./bindings";

export type Transcription = bindings.Transcription;

export type TranscriptionScope = bindings.TranscriptionScope;

/** Transcribes the Current Resource's media file within `scope`, over its original subtitle only when `overwrite`. */
export function transcribe(
  overwrite: boolean,
  scope: TranscriptionScope = { kind: "whole" },
): Promise<Transcription> {
  return invoke<Transcription>("transcribe", { overwrite, scope });
}

/** Rust sends every field; only a saved file read back may leave one out. */
export type TranscriptionSettings = Required<bindings.TranscriptionSettings>;

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
