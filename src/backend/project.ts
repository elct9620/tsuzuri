import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type * as bindings from "./bindings";

export type { UnlistenFn };

export type Segment = bindings.Segment_Serialize;

export type ProjectOptions = bindings.ProjectOptions_Serialize;

export type ProjectModels = bindings.ProjectModels_Serialize;

export type TranscriptionOverrides = bindings.TranscriptionOverrides;

export type ResourceView = bindings.ResourceView;

export type ProjectView = bindings.ProjectView_Serialize;

export type ProjectModelPresets = bindings.ProjectModelPresets;

export type SegmentSpan = bindings.SegmentSpan;

/** The position of every Segment `span` covers, first to last. */
export function spanIndexes(span: SegmentSpan): number[] {
  return Array.from(
    { length: span.last - span.first + 1 },
    (_, at) => span.first + at,
  );
}

export type RunningMode = bindings.RunningMode;

/** Whether the Current Resource shows a text in `zh-TW` to clean: the original of a `zh-TW` Project, or the translation shown. */
export function hasTraditionalChinese(project: ProjectView | null): boolean {
  return (
    project?.language === "zh-TW" || project?.shown_translation === "zh-TW"
  );
}

/** The Current Resource as the Resource list shows it, or none. */
export function currentResource(
  project: ProjectView | null,
): ResourceView | undefined {
  return project?.resources.find(
    (resource) => resource.name === project.current_resource,
  );
}

/** The URL a media element reads `media` from, allowed for the directories opened as a Project. */
export function mediaUrl(media: string): string {
  return convertFileSrc(media);
}

export type TranslationGlossaryView = bindings.TranslationGlossaryView;

/** The Project Rust holds now, or none before one is made. */
export function currentProject(): Promise<ProjectView | null> {
  return invoke<ProjectView | null>("current_project");
}

/**
 * The Project Rust holds, read once for each change and handed to every follower in the order they
 * began to follow, then to each `afterEach` callback; one that throws is reported and the rest are
 * still called. A read answered after a later one is dropped, so no follower is shown an older
 * Project than it already has.
 */
export class ProjectFeed {
  /** The Project last read, or `undefined` before the first read. */
  private latest: ProjectView | null | undefined = undefined;
  private readonly followers = new Set<(project: ProjectView | null) => void>();
  private readonly settlers: (() => void)[] = [];
  private readsAsked = 0;
  /** The number of the latest read handed to the followers. */
  private latestShownRead = 0;

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
    const unlisten = await listen("project-changed", () => void this.refresh());
    await this.refresh();
    return unlisten;
  }

  /** Reads the Project now, as when Rust announces nothing after refusing a change. */
  async refresh(): Promise<void> {
    const readNumber = ++this.readsAsked;
    const project = await currentProject();
    if (readNumber < this.latestShownRead) return;
    this.latestShownRead = readNumber;
    this.latest = project;
    for (const show of this.followers) callReporting(() => show(project));
    for (const settle of this.settlers) callReporting(settle);
  }
}

/** Calls `callback`, reporting what it throws as uncaught so the callbacks after it still run. */
function callReporting(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    reportError(error);
  }
}

export type EditCommand = bindings.EditCommand;

/** The command that opens a directory as the Project, or the directory of an SRT file. */
export type OpenCommand = "open_project" | "open_srt";

/** Opens `path` as the Project, a directory or the directory of an SRT file, in `language` when the directory records none. */
export function openProject(
  command: OpenCommand,
  path: string,
  language: string,
): Promise<void> {
  return invoke(command, { path, language });
}

/** The Requested SRT, answered once, or none when the system asked for none since. */
export function takeRequestedSrt(): Promise<string | null> {
  return invoke("take_requested_srt");
}

export type RecentProjectView = bindings.RecentProjectView;

/** The Recent Projects, the latest opened first, without the Project already open. */
export function recentProjects(): Promise<RecentProjectView[]> {
  return invoke("recent_projects");
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

export type WrittenText = bindings.WrittenText;

export type ExportFormat = bindings.ExportFormat;

export function exportPath(
  content: WrittenText,
  format: ExportFormat,
): Promise<string> {
  return invoke<string>("export_path", { content, format });
}

export function saveSrt(path: string, content: WrittenText): Promise<void> {
  return invoke("save_srt", { path, content });
}

/**
 * Writes the Current Resource to `path` as Plain Text, its Speakers named when `hasSpeakers` and
 * a blank line between blocks when `hasBlankLines`.
 */
export function saveText(
  path: string,
  content: WrittenText,
  hasSpeakers: boolean,
  hasBlankLines: boolean,
): Promise<void> {
  return invoke("save_text", { path, content, hasSpeakers, hasBlankLines });
}

export type Backup = bindings.Backup;

export type BackupKind = bindings.BackupKind;

export type SubtitleVersions = bindings.SubtitleVersions;

export type ComparedCue = bindings.ComparedCue;

export type RowKind = bindings.RowKind;

export type ComparedRow = bindings.ComparedRow;

export type TextSpan = bindings.TextSpan;

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

export type Restoration = bindings.Restoration;

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

export type RevertPart = bindings.RevertPart;

/** Takes back one Comparison Row of `backup` against the subtitle in `language`, as they compare now. */
export function revertRow(
  language: string | null,
  backup: string,
  row: number,
  part: RevertPart,
): Promise<Restoration> {
  return invoke<Restoration>("revert_row", { language, backup, row, part });
}

export type GlossaryRow = bindings.GlossaryRow;

export type GlossaryTable = bindings.GlossaryTable;

export function translationGlossaryTable(): Promise<GlossaryTable> {
  return invoke<GlossaryTable>("translation_glossary_table");
}

export function saveTranslationGlossary(rows: GlossaryRow[]): Promise<void> {
  return invoke("save_translation_glossary", { rows });
}
