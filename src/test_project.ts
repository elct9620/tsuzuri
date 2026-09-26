import type { ProjectView, ResourceView } from "./backend/project";

/** A Project in `/talks`, in `zh-TW`, whose Current Resource is `ep01`, holding what `changes` name. */
export function projectOf(changes: Partial<ProjectView> = {}): ProjectView {
  return {
    directory: "/talks",
    language: "zh-TW",
    translation_language: null,
    options: {
      bilingual_order: "original-first",
      is_bilingual_autosaved: false,
      is_overwrite_backed_up: false,
      models: { transcription: null, translation: null },
      transcription: {
        has_vad: null,
        is_non_speech_suppressed: null,
        is_context_carried: null,
      },
    },
    translation_glossary: null,
    resources: [resourceOf()],
    current_resource: "ep01",
    media: null,
    segments: [],
    shown_translation: null,
    has_undo: false,
    has_redo: false,
    running_mode: null,
    pending_batch: null,
    ...changes,
  };
}

/** `ep01` with an original subtitle and no media file, holding what `changes` name. */
export function resourceOf(changes: Partial<ResourceView> = {}): ResourceView {
  return {
    name: "ep01",
    has_media: false,
    has_subtitle: true,
    translation_languages: [],
    ...changes,
  };
}
