import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export type { UnlistenFn };

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

/** The file a Translation Glossary came from, how many terms it holds, and the Speakers it names in the Primary Language. */
export interface TranslationGlossaryView {
  file: string;
  term_count: number;
  speakers: string[];
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

/** Asks every view to read the Project again, as when Rust announces nothing after a refusal. */
export function refreshProject(): Promise<void> {
  return emit("project-changed");
}

/** Opens `path` as the Project, a directory or the directory of an SRT file, in `language` when the directory records none. */
export function openProject(
  command: "open_project" | "open_srt",
  path: string,
  language: string,
): Promise<void> {
  return invoke(command, { path, language });
}

export function selectResource(name: string | undefined): Promise<void> {
  return invoke("select_resource", { name });
}

export function setPrimaryLanguage(language: string): Promise<void> {
  return invoke("set_primary_language", { language });
}

export function setProjectOptions(options: ProjectOptions): Promise<void> {
  return invoke("set_project_options", { options });
}

/** Which text of a Segment an edit replaces. */
export type SegmentField = "text" | "translation" | "speaker";

export function editSegment(
  index: number,
  field: SegmentField,
  value: string,
): Promise<void> {
  return invoke("edit_segment", { index, field, value });
}

export function showTranslation(language: string | null): Promise<void> {
  return invoke("show_translation", { language });
}

/** A change to the Segments themselves, named as Rust names it. */
export type SegmentChange =
  | { kind: "times"; index: number; start_ms: number; end_ms: number }
  | { kind: "insertion-before"; index: number }
  | { kind: "insertion-after"; index: number }
  | { kind: "deletion"; index: number }
  | { kind: "split"; index: number; at: number }
  | { kind: "merge"; first: number; last: number }
  | { kind: "shift"; first: number; last: number; offset_ms: number };

export function changeSegments(change: SegmentChange): Promise<void> {
  return invoke("change_segments", { change });
}

/** Which texts an SRT written from the Current Resource carries. */
export type SrtContent = "original" | "translation" | "bilingual";

export function exportPath(content: SrtContent): Promise<string> {
  return invoke<string>("export_path", { content });
}

export function saveSrt(path: string, content: SrtContent): Promise<void> {
  return invoke("save_srt", { path, content });
}

/** A Backup as Rust lists it: its file name in the history and the UTC time it was taken. */
export interface Backup {
  file: string;
  /** `YYYYMMDDTHHMMSSZ` */
  taken_at: string;
}

/** The Backups of the original, with no Language, or of one translation. */
export interface SubtitleVersions {
  language: string | null;
  backups: Backup[];
}

export interface ComparedRow {
  start_ms: number;
  end_ms: number;
  left: string | null;
  right: string | null;
  is_changed: boolean;
}

export function subtitleVersions(): Promise<SubtitleVersions[]> {
  return invoke<SubtitleVersions[]>("subtitle_versions");
}

/** The cues of two Versions of one subtitle side by side, where none names the subtitle as it is now. */
export function compareVersions(
  language: string | null,
  left: string | null,
  right: string | null,
): Promise<ComparedRow[]> {
  return invoke<ComparedRow[]>("compare_versions", { language, left, right });
}

export function restoreVersion(
  language: string | null,
  backup: string | undefined,
): Promise<void> {
  return invoke("restore_version", { language, backup });
}

/** One term: its word in each Language, and whether it names a Speaker. */
export interface GlossaryRow {
  words: string[];
  is_speaker: boolean;
}

/** The Translation Glossary laid out for editing, named as Rust names it. */
export interface GlossaryTable {
  languages: string[];
  rows: GlossaryRow[];
  has_source_target_header: boolean;
}

export function translationGlossaryTable(): Promise<GlossaryTable> {
  return invoke<GlossaryTable>("translation_glossary_table");
}

export function saveTranslationGlossary(rows: GlossaryRow[]): Promise<void> {
  return invoke("save_translation_glossary", { rows });
}
