import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { TranscriptionSettings } from "./transcription";

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
  /** The Project Models; a slot without one uses the general settings' Model. */
  models: ProjectModels;
  transcription: TranscriptionOverrides;
}

export interface ProjectModels {
  transcription: string | null;
  translation: string | null;
}

/** The Transcription Settings a Project sets for itself; `null` follows the general ones. */
export type TranscriptionOverrides = {
  [Setting in keyof TranscriptionSettings]: boolean | null;
};

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
  /** Whether the Current Resource has a change to undo. */
  has_undo: boolean;
  /** Whether the Current Resource has an undone change to redo. */
  has_redo: boolean;
  /** The Mode running on the Current Resource, holding the subtitles it writes. */
  running_mode: RunningMode | null;
  /** The Segments the running translation works on now, by position. */
  pending_batch: SegmentSpan | null;
}

/** A transcription holds every subtitle of its Resource; a translation, the one it writes. */
/** The Segments from `first` through `last`, by position. */
export interface SegmentSpan {
  first: number;
  last: number;
}

export type RunningMode =
  { mode: "transcription" } | { mode: "translation"; language: string };

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

/**
 * The Project Rust holds, read once for each change and handed to every follower in the order they
 * began to follow, then to each `afterEach` callback. A read answered after a later one is dropped,
 * so no follower is shown an older Project than it already has.
 */
export class ProjectFeed {
  /** The Project last read, or `undefined` before the first read. */
  private latest: ProjectView | null | undefined = undefined;
  private readonly followers = new Set<(project: ProjectView | null) => void>();
  private readonly settlers: (() => void)[] = [];
  private asked = 0;
  private shown = 0;

  /** The Project last read, or none. */
  get project(): ProjectView | null {
    return this.latest ?? null;
  }

  /** Calls `show` with the Project read last, if any, and again with each one read after it. */
  follow(show: (project: ProjectView | null) => void): () => void {
    this.followers.add(show);
    if (this.latest !== undefined) show(this.latest);
    return () => this.followers.delete(show);
  }

  /** Calls `settle` once every follower has been shown a Project. */
  afterEach(settle: () => void): void {
    this.settlers.push(settle);
  }

  /** Reads the Project now and each time Rust announces a change. */
  async start(): Promise<UnlistenFn> {
    const unlisten = await listen("project-changed", () => void this.read());
    await this.read();
    return unlisten;
  }

  private async read(): Promise<void> {
    const asked = ++this.asked;
    const project = await currentProject();
    if (asked < this.shown) return;
    this.shown = asked;
    this.latest = project;
    for (const show of this.followers) show(project);
    for (const settle of this.settlers) settle();
  }
}

/** Undo or Redo chosen from the Edit menu. */
export type EditCommand = "undo" | "redo";

/** Calls `apply` with each Undo or Redo chosen from the Edit menu, which takes their shortcuts first. */
export function followEditCommands(
  apply: (command: EditCommand) => void,
): Promise<UnlistenFn> {
  return listen<EditCommand>("edit-command", (event) => apply(event.payload));
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

/** Pairs the Project's files again and reads the Current Resource again from them. */
export function reloadProject(): Promise<void> {
  return invoke("reload_project");
}

export function showTranslation(language: string | null): Promise<void> {
  return invoke("show_translation", { language });
}

/** Which texts an SRT written from the Current Resource carries. */
export type SrtContent = "original" | "translation" | "bilingual";

export function exportPath(content: SrtContent): Promise<string> {
  return invoke<string>("export_path", { content });
}

export function saveSrt(path: string, content: SrtContent): Promise<void> {
  return invoke("save_srt", { path, content });
}

/** A Backup as Rust lists it: its file name in the history, the UTC time it was taken and its kind. */
export interface Backup {
  file: string;
  /** `YYYYMMDDTHHMMSSZ` */
  taken_at: string;
  kind: BackupKind;
}

/** What a Mode has just written, or a subtitle just before it was written over. */
export type BackupKind = "output" | "overwrite";

/** The Backups of the original, with no Language, or of one translation. */
export interface SubtitleVersions {
  language: string | null;
  backups: Backup[];
}

/** One cue of a Version as a Comparison Row shows it. */
export interface ComparedCue {
  start_ms: number;
  end_ms: number;
  text: string;
}

/** How the cues of a Comparison Row stand to each other. */
export type RowKind = "pair" | "addition" | "removal" | "split" | "merge";

/** The cues of two Versions that cover the same speech, and what changed between them. */
export interface ComparedRow {
  kind: RowKind;
  left: ComparedCue[];
  right: ComparedCue[];
  is_text_changed: boolean;
  is_time_changed: boolean;
  /** A Pair's changed text character by character; empty otherwise. */
  text_spans: TextSpan[];
}

/** A run of characters of a Pair's text: in both Versions, only the earlier, or only the later. */
export interface TextSpan {
  kind: "common" | "removal" | "addition";
  text: string;
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

/** What a restore left behind: how many Segments it gave times that no translation lines up with. */
export interface Restoration {
  unmatched_count: number;
}

export function restoreVersion(
  language: string | null,
  backup: string | undefined,
): Promise<Restoration> {
  return invoke<Restoration>("restore_version", { language, backup });
}

/** The cues of the Current Resource's translation into `language`, as its file is written. */
export function translationCues(language: string): Promise<ComparedCue[]> {
  return invoke<ComparedCue[]>("translation_cues", { language });
}

/** Which part of a Comparison Row to take back. */
export type RevertPart = "text" | "times" | "whole";

/** Takes back one Comparison Row of `backup` against the subtitle in `language`, as they compare now. */
export function revertRow(
  language: string | null,
  backup: string,
  row: number,
  part: RevertPart,
): Promise<Restoration> {
  return invoke<Restoration>("revert_row", { language, backup, row, part });
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
