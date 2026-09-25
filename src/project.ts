import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Segment {
  start_ms: number;
  end_ms: number;
  speaker?: string;
  text: string;
  translation?: string;
}

/** What the user sets for one Project in the settings beside its Primary Language. */
export interface ProjectOptions {
  bilingual_order: "original-first" | "translation-first";
  is_bilingual_autosaved: boolean;
  is_overwrite_backed_up: boolean;
}

/** A Resource as the Resource list shows it. */
export interface ResourceView {
  name: string;
  has_media: boolean;
  has_subtitle: boolean;
  /** The Language codes of its translation files. */
  translation_languages: string[];
}

/** The Project as Rust holds it; the webview only ever shows this, never a copy of its own. */
export interface ProjectView {
  directory: string;
  /** The Primary Language code. */
  language: string;
  /** The Language code of the last translation. */
  translation_language: string | null;
  options: ProjectOptions;
  translation_glossary: TranslationGlossaryView | null;
  resources: ResourceView[];
  current_resource: string | null;
  /** The Current Resource's media file. */
  media: string | null;
  /** The Current Resource's Segments. */
  segments: Segment[];
  /** The Language code of the translations the Segments carry. */
  shown_translation: string | null;
}

/** The Current Resource as the Resource list shows it, or none. */
export function currentResource(
  project: ProjectView | null,
): ResourceView | undefined {
  return project?.resources.find(
    (resource) => resource.name === project.current_resource,
  );
}

/** The file a Translation Glossary came from and how many terms it holds. */
export interface TranslationGlossaryView {
  file: string;
  term_count: number;
}

/** The Project Rust holds now, or none before one is made. */
export function currentProject(): Promise<ProjectView | null> {
  return invoke<ProjectView | null>("current_project");
}

/** Calls `show` with the Project Rust holds now and again each time it changes. */
export async function followProject(
  show: (project: ProjectView | null) => void,
): Promise<UnlistenFn> {
  const refresh = async () => show(await currentProject());
  const unlisten = await listen("project-changed", () => void refresh());
  await refresh();
  return unlisten;
}
