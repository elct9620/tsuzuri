import { convertFileSrc } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import type * as bindings from "./bindings";
import { commands, events } from "./bindings";

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

/** The Language a Simplified Cleanup applies to. */
export const TRADITIONAL_CHINESE: Language = "zh-TW";

/** Whether the Current Resource shows a text in `zh-TW` to clean: the original of a `zh-TW` Project, or the translation shown. */
export function hasTraditionalChinese(project: ProjectView | null): boolean {
  return (
    project?.language === TRADITIONAL_CHINESE ||
    project?.shown_translation === TRADITIONAL_CHINESE
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
  return commands.currentProject();
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
    const unlisten = await events.projectChanged.listen(
      () => void this.refresh(),
    );
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

export type Language = bindings.Language;

/** The command that opens a directory as the Project, or the directory of an SRT file. */
export type OpenCommand = Extract<
  keyof typeof commands,
  "openProject" | "openSrt"
>;

/** Opens `path` as the Project, a directory or the directory of an SRT file, in `language` when the directory records none. */
export async function openProject(
  command: OpenCommand,
  path: string,
  language: string,
): Promise<void> {
  await commands[command](path, language as Language);
}

/** The Requested SRT, answered once, or none when the system asked for none since. */
export function takeRequestedSrt(): Promise<string | null> {
  return commands.takeRequestedSrt();
}

export type RecentProjectView = bindings.RecentProjectView;

/** The Recent Projects, the latest opened first, without the Project already open. */
export function recentProjects(): Promise<RecentProjectView[]> {
  return commands.recentProjects();
}

export async function selectResource(name: string): Promise<void> {
  await commands.selectResource(name);
}

export async function setPrimaryLanguage(language: string): Promise<void> {
  await commands.setPrimaryLanguage(language as Language);
}

export async function setProjectOptions(
  options: ProjectOptions,
): Promise<void> {
  await commands.setProjectOptions(options);
}

/** Pairs the Project's files again and reads the Current Resource again from them. */
export async function reloadProject(): Promise<void> {
  await commands.reloadProject();
}

export async function showTranslation(language: string | null): Promise<void> {
  await commands.showTranslation(language as Language | null);
}

export type WrittenText = bindings.WrittenText;

export type ExportFormat = bindings.ExportFormat;

export function exportPath(
  content: WrittenText,
  format: ExportFormat,
): Promise<string> {
  return commands.exportPath(content, format);
}

export async function saveSrt(
  path: string,
  content: WrittenText,
): Promise<void> {
  await commands.saveSrt(path, content);
}

/**
 * Writes the Current Resource to `path` as Plain Text, its Speakers named when `hasSpeakers` and
 * a blank line between blocks when `hasBlankLines`.
 */
export async function saveText(
  path: string,
  content: WrittenText,
  hasSpeakers: boolean,
  hasBlankLines: boolean,
): Promise<void> {
  await commands.saveText(path, content, hasSpeakers, hasBlankLines);
}

export type Backup = bindings.Backup;

export type BackupKind = bindings.BackupKind;

export type SubtitleVersions = bindings.SubtitleVersions;

export type ComparedCue = bindings.ComparedCue;

export type RowKind = bindings.RowKind;

export type ComparedRow = bindings.ComparedRow;

export type TextSpan = bindings.TextSpan;

export function subtitleVersions(): Promise<SubtitleVersions[]> {
  return commands.subtitleVersions();
}

/** The cues of two Versions of one subtitle side by side, where none names the subtitle as it is now. */
export function compareVersions(
  language: string | null,
  left: string | null,
  right: string | null,
): Promise<ComparedRow[]> {
  return commands.compareVersions(language as Language | null, left, right);
}

export type Restoration = bindings.Restoration;

export function restoreVersion(
  language: string | null,
  backup: string,
): Promise<Restoration> {
  return commands.restoreVersion(language as Language | null, backup);
}

/** The cues of the Current Resource's translation into `language`, as its file is written. */
export function translationCues(language: string): Promise<ComparedCue[]> {
  return commands.translationCues(language as Language);
}

export type RevertPart = bindings.RevertPart;

/** Takes back one Comparison Row of `backup` against the subtitle in `language`, as they compare now. */
export function revertRow(
  language: string | null,
  backup: string,
  row: number,
  part: RevertPart,
): Promise<Restoration> {
  return commands.revertRow(language as Language | null, backup, row, part);
}

export type GlossaryRow = bindings.GlossaryRow;

export type GlossaryTable = bindings.GlossaryTable;

export function translationGlossaryTable(): Promise<GlossaryTable> {
  return commands.translationGlossaryTable();
}

export async function saveTranslationGlossary(
  rows: GlossaryRow[],
): Promise<void> {
  await commands.saveTranslationGlossary(rows);
}
