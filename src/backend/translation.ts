import { invoke } from "@tauri-apps/api/core";

import type { PhaseTiming } from "./progress";

/** The choices a translation is started with, named as Rust names them. */
export interface TranslationOptions {
  has_speaker_labels: boolean;
  has_self_review: boolean;
  summary_word_limit: number | null;
}

/** How a translation is batched and repaired, as Rust saves it. */
export interface TranslationSettings {
  batch_size: number;
  retries: number;
  reference_lines: number;
  has_resident_llama: boolean;
  model_keep_seconds: number;
}

export interface Translation {
  phases: PhaseTiming[];
  /** How many Segments of the original, retimed while it was translated, find no cue at their times. */
  unmatched_count: number;
}

/** Translates the Current Resource from the Primary Language; the translations land in the Project, not in the answer. */
export function translate(
  target: string,
  options: TranslationOptions,
): Promise<Translation> {
  return invoke<Translation>("translate", { target, options });
}

/** Translates the Segments at `indexes` again into the translation shown, as one change. */
export function retranslate(indexes: number[]): Promise<Translation> {
  return invoke<Translation>("retranslate", { indexes });
}

export function translationSettings(): Promise<TranslationSettings> {
  return invoke<TranslationSettings>("translation_settings");
}

export function saveTranslationSettings(
  settings: TranslationSettings,
): Promise<TranslationSettings> {
  return invoke<TranslationSettings>("save_translation_settings", { settings });
}
