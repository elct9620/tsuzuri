import type { ProjectView, ResourceView } from "./project";

/** A Project in `/talks`, in `zh-TW`, whose Current Resource is `ep01`, holding what `changes` name. */
export function projectOf(changes: Partial<ProjectView> = {}): ProjectView {
  return {
    directory: "/talks",
    language: "zh-TW",
    translation_language: null,
    options: { bilingual_order: "original-first" },
    translation_glossary: null,
    resources: [resourceOf()],
    current_resource: "ep01",
    media: null,
    segments: [],
    shown_translation: null,
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
