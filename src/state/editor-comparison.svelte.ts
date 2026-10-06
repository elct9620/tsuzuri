/**
 * The editor's comparison: the Backup of the original and of the translation shown that the rows
 * are compared with, the other translations read beneath the cues, and what each answered; shared
 * by the compare menu, the Versions dialog that sets a Backup, and the rows that show it.
 */

import {
  compareVersions,
  currentResource,
  revertRow,
  subtitleVersions,
  translationCues,
  type ComparedCue,
  type ComparedRow,
  type ProjectView,
  type RevertPart,
  type Segment,
  type SubtitleVersions,
} from "#/ipc/project.ts";
import { t } from "#/i18n.ts";
import {
  attempt,
  notifyFailure,
  notifyRestoration,
} from "#/state/notification.svelte.ts";

/** Which subtitle a comparison is of: the original, or the translation shown. */
export type Side = "original" | "translation";

const SIDES: Side[] = ["original", "translation"];

/** A Backup of one subtitle, by its Language or none for the original, to compare the subtitle now with. */
interface ComparedBackup {
  language: string | null;
  file: string;
}

/** One Comparison Row of a side, by its place in that side's comparison, which taking it back names. */
export interface SideRow {
  side: Side;
  row: ComparedRow;
  index: number;
}

/** What a Segment's row shows of the comparison: each side's rows covering it, and the cue of each translation read. */
export interface SegmentComparison {
  rowsBySide: Record<Side, SideRow[]>;
  references: { language: string; text: string }[];
}

/** The comparison laid over the Segments: each Segment's, and the Removals standing before each, the last after them all. */
export interface ComparisonLayout {
  bySegment: SegmentComparison[];
  removalsBefore: SideRow[][];
}

/** The newest Output of the subtitle in `language`, or of the original for none. */
function newestOutput(
  versions: SubtitleVersions[],
  language: string | null,
): string | null {
  const subtitle = versions.find((each) => each.language === language);
  return (
    subtitle?.backups.find((backup) => backup.kind === "output")?.file ?? null
  );
}

/** The badges a row takes: what changed in it. */
export function markLabels(row: ComparedRow): string[] {
  switch (row.kind) {
    case "addition":
      return ["compare.added"];
    case "split":
      return ["compare.split"];
    case "merge":
      return ["compare.merged"];
    case "removal":
      return [];
    case "pair":
      return [
        ...(row.is_text_changed ? ["compare.textChanged"] : []),
        ...(row.is_time_changed ? ["compare.timesChanged"] : []),
      ];
  }
}

/**
 * Takes out the things at the times given, one at a time in the order `things` holds them, so
 * Segments said at once, which share their times, each pair with their own cue.
 */
function takerAtTimes<T>(
  things: T[],
  timesOf: (thing: T) => [number, number],
): (start_ms: number, end_ms: number) => T | undefined {
  const thingsByTimes = new Map<string, T[]>();
  for (const thing of things) {
    const key = timesOf(thing).join();
    thingsByTimes.set(key, [...(thingsByTimes.get(key) ?? []), thing]);
  }
  return (start_ms, end_ms) =>
    thingsByTimes.get([start_ms, end_ms].join())?.shift();
}

/**
 * Lays each side's rows over the Segments with the times of their cues now, and each Removal
 * before the first Segment starting no earlier than it, and finds each translation's cue for
 * each Segment.
 */
export function comparisonLayout(
  segments: Segment[],
  rowsBySide: Record<Side, ComparedRow[]>,
  cuesByLanguage: [string, ComparedCue[]][],
): ComparisonLayout {
  const bySegment: SegmentComparison[] = segments.map(() => ({
    rowsBySide: { original: [], translation: [] },
    references: [],
  }));
  const removalsBefore: SideRow[][] = [...segments, null].map(() => []);
  const indexes = segments.map((_, index) => index);
  for (const side of SIDES) {
    const segmentAt = takerAtTimes(indexes, (index) => [
      segments[index].start_ms,
      segments[index].end_ms,
    ]);
    rowsBySide[side].forEach((row, index) => {
      if (row.kind === "removal") {
        const start = row.left[0].start_ms;
        const next = segments.findIndex((each) => each.start_ms >= start);
        removalsBefore[next === -1 ? segments.length : next].push({
          side,
          row,
          index,
        });
        return;
      }
      for (const cue of row.right) {
        const at = segmentAt(cue.start_ms, cue.end_ms);
        if (at !== undefined && markLabels(row).length > 0)
          bySegment[at].rowsBySide[side].push({ side, row, index });
      }
    });
  }
  for (const [language, cues] of cuesByLanguage) {
    const cueAt = takerAtTimes(cues, (cue) => [cue.start_ms, cue.end_ms]);
    segments.forEach((segment, index) => {
      const cue = cueAt(segment.start_ms, segment.end_ms);
      if (cue) bySegment[index].references.push({ language, text: cue.text });
    });
  }
  return { bySegment, removalsBefore };
}

/**
 * Compares the editor's Segments with a Backup of the original and of the translation shown, and
 * reads other translations beneath the cues; a row is taken back from its side's Backup.
 */
export class EditorComparison {
  /** The Backups there are of each subtitle of the Current Resource. */
  versions = $state.raw<SubtitleVersions[]>([]);
  /** The Backup each side is compared with, or none. */
  fileBySide = $state<Record<Side, string | null>>({
    original: null,
    translation: null,
  });
  /** The translation shown, whose Backups the translation is compared with. */
  shownTranslation = $state<string | null>(null);
  /** The translations that could be read beneath the cues, and those read. */
  offeredReferences = $state.raw<string[]>([]);
  references = $state.raw<string[]>([]);
  /** What each side's comparison answered. */
  rowsBySide = $state.raw<Record<Side, ComparedRow[]>>({
    original: [],
    translation: [],
  });
  /** The cues of each translation read. */
  cuesByLanguage = $state.raw<[string, ComparedCue[]][]>([]);

  /** The Current Resource the choices were made for, so a new one is compared afresh. */
  private resource: string | null = null;
  /** The newest Output of the original when the choices were last made, so a newer one is taken up. */
  private newestOutputFile: string | null = null;
  /** How many Segments the comparison was laid over; Segments changed in number are others. */
  private comparedSegmentCount = 0;
  /** The Backups asked for last; an answer to an earlier ask is dropped. */
  private versionsRequest?: Promise<SubtitleVersions[]>;
  /** The comparison asked for last; an answer to an earlier one is dropped. */
  private comparisonRequest?: object;

  /** The sides there are: the original, and the translation while one is shown. */
  get sides(): Side[] {
    return this.shownTranslation === null ? ["original"] : SIDES;
  }

  /** The name a side goes by: the original, or the translation's Language. */
  sideName(side: Side): string {
    return side === "original"
      ? t("compare.original")
      : t(`languages.${this.shownTranslation}`);
  }

  /** The subtitle a side compares: none for the original, or the translation's Language. */
  sideLanguage(side: Side): string | null {
    return side === "original" ? null : this.shownTranslation;
  }

  /** The Backups the subtitle of a side has. */
  sideBackups(side: Side): SubtitleVersions["backups"] {
    const language = this.sideLanguage(side);
    return (
      this.versions.find((each) => each.language === language)?.backups ?? []
    );
  }

  /** The few Backups the compare menu offers a side: its newest Output, and the one chosen now. */
  offeredFiles(side: Side): string[] {
    return [
      ...new Set([
        newestOutput(this.versions, this.sideLanguage(side)),
        this.fileBySide[side],
      ]),
    ].filter((file): file is string => file !== null);
  }

  /**
   * Compares the Segments just shown, offering the Backups there are now: the newest Output of the
   * original is chosen for a new Resource, in place of a Backup no longer kept, and once a newer
   * one is kept unless nothing was chosen; the translation is compared with nothing once another
   * translation is shown.
   */
  async show(project: ProjectView | null): Promise<void> {
    const segmentCount = project?.segments.length ?? 0;
    if (segmentCount !== this.comparedSegmentCount) {
      this.rowsBySide = { original: [], translation: [] };
      this.cuesByLanguage = [];
    }
    this.comparedSegmentCount = segmentCount;
    const resource = project?.current_resource ?? null;
    const shownLanguage = project?.shown_translation ?? null;
    const request = readVersions(project);
    this.versionsRequest = request;
    const versions = await request;
    if (request !== this.versionsRequest) return;
    this.versions = versions;
    const output = newestOutput(versions, null);
    const isNewResource = resource !== this.resource;
    const isGone = (language: string | null, file: string | null) =>
      file !== null &&
      !versions
        .find((each) => each.language === language)
        ?.backups.some((backup) => backup.file === file);
    const isNothingChosen =
      this.fileBySide.original === null && this.newestOutputFile !== null;
    if (
      isNewResource ||
      isGone(null, this.fileBySide.original) ||
      (output !== this.newestOutputFile && !isNothingChosen)
    )
      this.fileBySide.original = output;
    if (
      isNewResource ||
      shownLanguage !== this.shownTranslation ||
      isGone(shownLanguage, this.fileBySide.translation)
    )
      this.fileBySide.translation = null;
    this.offeredReferences = (
      currentResource(project)?.translation_languages ?? []
    ).filter((language) => language !== shownLanguage);
    this.references = isNewResource
      ? []
      : this.references.filter((language) =>
          this.offeredReferences.includes(language),
        );
    this.resource = resource;
    this.shownTranslation = shownLanguage;
    this.newestOutputFile = output;
    await this.compare();
  }

  /** Compares a side with `file`, or with nothing. */
  async choose(side: Side, file: string | null): Promise<void> {
    this.fileBySide[side] = file;
    await this.compare();
  }

  /** Reads the translations in `languages` beneath the cues. */
  async chooseReferences(languages: string[]): Promise<void> {
    this.references = languages;
    await this.compare();
  }

  /** Compares with the Backup the Versions dialog set as the comparison, if it is of a side there is. */
  async compareWith(language: string | null, file: string): Promise<void> {
    if (language === null) this.fileBySide.original = file;
    else if (language === this.shownTranslation)
      this.fileBySide.translation = file;
    else return;
    await this.compare();
  }

  /** Takes back the `part` of the row at `index` of a side's comparison from its Backup. */
  async revert({ side, index }: SideRow, part: RevertPart): Promise<void> {
    const backup = this.sideBackup(side);
    if (backup === null) return;
    await attempt(t("compare.notReverted"), async () => {
      notifyRestoration(
        t("compare.reverted"),
        await revertRow(backup.language, backup.file, index, part),
      );
    });
  }

  private sideBackup(side: Side): ComparedBackup | null {
    const file = this.fileBySide[side];
    if (file === null) return null;
    if (side === "original") return { language: null, file };
    return this.shownTranslation === null
      ? null
      : { language: this.shownTranslation, file };
  }

  private async compare(): Promise<void> {
    const request = {};
    this.comparisonRequest = request;
    const rowsBySide: Record<Side, ComparedRow[]> = {
      original: [],
      translation: [],
    };
    const cuesByLanguage: [string, ComparedCue[]][] = [];
    try {
      for (const side of SIDES) {
        const backup = this.sideBackup(side);
        if (backup)
          rowsBySide[side] = await compareVersions(
            backup.language,
            backup.file,
            null,
          );
      }
      for (const language of this.references)
        cuesByLanguage.push([language, await translationCues(language)]);
    } catch (error) {
      if (request === this.comparisonRequest)
        notifyFailure(t("versions.unreadable"), error);
    }
    if (request !== this.comparisonRequest) return;
    this.rowsBySide = rowsBySide;
    this.cuesByLanguage = cuesByLanguage;
  }
}

async function readVersions(
  project: ProjectView | null,
): Promise<SubtitleVersions[]> {
  if (!project?.current_resource) return [];
  try {
    return await subtitleVersions();
  } catch (error) {
    notifyFailure(t("versions.unreadable"), error);
    return [];
  }
}
