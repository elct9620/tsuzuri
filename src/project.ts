import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Segment {
  start_ms: number;
  end_ms: number;
  text: string;
  translation?: string;
}

/** The Project as Rust holds it; the webview only ever shows this, never a copy of its own. */
export interface ProjectView {
  media: string | null;
  segments: Segment[];
  /** The Language code the Transcript is in. */
  language: string;
  /** The Language code of the translations, once translated. */
  translation_language: string | null;
  translation_glossary: TranslationGlossaryView | null;
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
