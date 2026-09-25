import { Controller } from "@hotwired/stimulus";

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
  type SubtitleVersions,
} from "../backend/project";
import { fieldValue } from "../editor/field";
import { markRanges, textRange } from "../editor/highlight";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { iconElement } from "../ui/icons";
import { notifyFailure, notifyRestoration } from "../ui/notification";
import { formatTime, localTime, parseTime } from "../ui/time";
import type VersionsController from "./versions_controller";

/** Which subtitle a comparison is of: the original, or the translation shown. */
type Side = "original" | "translation";

/** A Backup of one subtitle, by its Language or none for the original, to compare the subtitle now with. */
interface ComparedBackup {
  language: string | null;
  file: string;
}

/** The highlight marking the characters a text gained since the Backup compared. */
const ADDED_HIGHLIGHT = "compare-addition";

/** The class of the text field each side's comparison marks. */
const FIELD_BY_SIDE: Record<Side, string> = {
  original: "text",
  translation: "translation",
};

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

/** The marks a row takes: what changed in it, by the badge that says so. */
function markLabels(row: ComparedRow): string[] {
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

function badge(label: string): HTMLSpanElement {
  const mark = document.createElement("span");
  mark.dataset.mark = "";
  mark.className = "badge badge-soft badge-warning badge-xs";
  mark.textContent = t(label);
  return mark;
}

/** The milliseconds a row's time field holds now, as typed or as the transcript wrote it. */
function timeOf(item: HTMLLIElement, edge: "start" | "end"): number | null {
  const field = item.querySelector<HTMLInputElement>(`[data-edge=${edge}]`);
  return field ? parseTime(field.value) : null;
}

function isSameCue(cue: ComparedCue, item: HTMLLIElement): boolean {
  return (
    cue.start_ms === timeOf(item, "start") && cue.end_ms === timeOf(item, "end")
  );
}

/** What a changed text read in the Backup, with the characters since removed struck out. */
function earlierText(row: ComparedRow): HTMLParagraphElement {
  const was = document.createElement("p");
  was.dataset.was = "";
  was.className = "px-1.5 text-xs text-base-content/60";
  was.append(t("compare.wasPrefix"));
  if (row.text_spans.length === 0) {
    was.append(row.left.map((cue) => cue.text).join(" / ") || "—");
    return was;
  }
  for (const span of row.text_spans) {
    if (span.kind === "addition") continue;
    if (span.kind === "common") {
      was.append(span.text);
      continue;
    }
    const removed = document.createElement("del");
    removed.className = "text-error";
    removed.textContent = span.text;
    was.append(removed);
  }
  return was;
}

/** The ranges of `field` holding the characters a Pair's text gained, while the field still reads that text. */
function addedRanges(field: HTMLElement, row: ComparedRow): Range[] {
  const kept = row.text_spans.filter((span) => span.kind !== "removal");
  if (kept.map((span) => span.text).join("") !== fieldValue(field)) return [];
  const ranges: Range[] = [];
  let offset = 0;
  for (const span of kept) {
    const end = offset + span.text.length;
    const range =
      span.kind === "addition" ? textRange(field, offset, end) : null;
    if (range) ranges.push(range);
    offset = end;
  }
  return ranges;
}

function menuTitle(text: string): HTMLLIElement {
  const title = document.createElement("li");
  title.className = "menu-title";
  title.textContent = text;
  return title;
}

/** One choice of the menu: a radio or checkbox with its label, routing its change to `comparison#choose`. */
function menuChoice(input: HTMLInputElement, label: string): HTMLLIElement {
  input.dataset.action = "change->comparison#choose";
  const text = document.createElement("span");
  text.textContent = label;
  const choice = document.createElement("label");
  choice.append(input, text);
  const item = document.createElement("li");
  item.append(choice);
  return item;
}

/**
 * Compares the editor's rows with a Backup of the original and of the translation shown, each
 * marked beside its own text field, shows each removed cue in its place, reads other translations
 * beneath the cues, and takes a row back from its menu.
 */
export default class ComparisonController extends Controller {
  static targets = ["menu", "list"];
  static outlets = ["versions"];

  /** The compare menu's choices, drawn from the Backups there are. */
  declare readonly menuTarget: HTMLElement;
  /** The editor's rows, which the transcript draws. */
  declare readonly listTarget: HTMLOListElement;
  declare readonly versionsOutlet: VersionsController;
  declare readonly hasVersionsOutlet: boolean;

  /** The Current Resource the choices were made for, so a new one is compared afresh. */
  private resource: string | null = null;
  /** The translation shown when the choices were made, whose Backups the translation is compared with. */
  private shownTranslation: string | null = null;
  /** The newest Output of the original when the choices were last made, so a newer one is taken up. */
  private newestOutputFile: string | null = null;
  private versions: SubtitleVersions[] = [];
  private fileBySide: Record<Side, string | null> = {
    original: null,
    translation: null,
  };
  /** The translations read beneath the cues, and those that could be. */
  private references: string[] = [];
  private offeredReferences: string[] = [];

  /**
   * Compares the Segments just shown, offering the Backups there are now: the newest Output of the
   * original is chosen for a new Resource and once a newer one is kept, and the translation is
   * compared with nothing once another translation is shown.
   */
  async mark({
    detail,
  }: CustomEvent<{ project: ProjectView | null }>): Promise<void> {
    const project = detail.project;
    const resource = project?.current_resource ?? null;
    const shown = project?.shown_translation ?? null;
    this.versions = await this.readVersions(project);
    const output = newestOutput(this.versions, null);
    const isNewResource = resource !== this.resource;
    const isListed = (language: string | null, file: string | null) =>
      this.versions
        .find((each) => each.language === language)
        ?.backups.some((backup) => backup.file === file) ?? false;
    if (
      isNewResource ||
      output !== this.newestOutputFile ||
      !isListed(null, this.fileBySide.original)
    )
      this.fileBySide.original = output;
    if (
      isNewResource ||
      shown !== this.shownTranslation ||
      !isListed(shown, this.fileBySide.translation)
    )
      this.fileBySide.translation = null;
    this.offeredReferences = (
      currentResource(project)?.translation_languages ?? []
    ).filter((language) => language !== shown);
    this.references = isNewResource
      ? []
      : this.references.filter((language) =>
          this.offeredReferences.includes(language),
        );
    this.resource = resource;
    this.shownTranslation = shown;
    this.newestOutputFile = output;
    this.offerChoices();
    await this.compare();
  }

  /** Compares with what the menu now has chosen. */
  async choose(): Promise<void> {
    for (const side of ["original", "translation"] as Side[]) {
      const checked = this.menuTarget.querySelector<HTMLInputElement>(
        `input[name="compare-${side}"]:checked`,
      );
      this.fileBySide[side] = checked?.value || null;
    }
    this.references = [
      ...this.menuTarget.querySelectorAll<HTMLInputElement>(
        "input[data-reference]:checked",
      ),
    ].map((input) => input.value);
    await this.compare();
  }

  /** Compares with the Backup the Versions dialog set as the comparison. */
  async compareWith({
    detail,
  }: CustomEvent<{ language: string | null; file: string }>): Promise<void> {
    if (detail.language === null) this.fileBySide.original = detail.file;
    else if (detail.language === this.shownTranslation)
      this.fileBySide.translation = detail.file;
    else return;
    this.offerChoices();
    await this.compare();
  }

  /** Opens the Versions dialog at the subtitle a menu group compares, to choose any of its Backups. */
  async chooseInVersions({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { side: Side };
  }): Promise<void> {
    closeMenu(currentTarget);
    if (!this.hasVersionsOutlet) return;
    await this.versionsOutlet.openAt(
      params.side === "original" ? null : this.shownTranslation,
    );
  }

  /** Takes back the row a menu item belongs to, in the part it names, from its side's Backup. */
  async revert({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { row: number; part: RevertPart; side: Side };
  }): Promise<void> {
    closeMenu(currentTarget);
    const backup = this.sideBackup(params.side);
    if (backup === null) return;
    try {
      notifyRestoration(
        t("compare.reverted"),
        await revertRow(backup.language, backup.file, params.row, params.part),
      );
    } catch (error) {
      notifyFailure(t("compare.notReverted"), error);
    }
  }

  private sideBackup(side: Side): ComparedBackup | null {
    const file = this.fileBySide[side];
    if (file === null) return null;
    if (side === "original") return { language: null, file };
    return this.shownTranslation === null
      ? null
      : { language: this.shownTranslation, file };
  }

  /** The name a side goes by: the original, or the translation's Language. */
  private sideName(side: Side): string {
    return side === "original"
      ? t("compare.original")
      : t(`languages.${this.shownTranslation}`);
  }

  private async readVersions(
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

  /** Offers each side a few Backups and the Versions dialog for the rest, and each other translation to read. */
  private offerChoices(): void {
    const sides: Side[] =
      this.shownTranslation === null
        ? ["original"]
        : ["original", "translation"];
    const referenceChoices = this.offeredReferences.map((language) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "checkbox checkbox-xs";
      input.dataset.reference = "";
      input.value = language;
      input.checked = this.references.includes(language);
      return menuChoice(input, t(`languages.${language}`));
    });
    const menu = document.createElement("ul");
    menu.className = "menu w-full";
    menu.append(
      ...sides.flatMap((side) => this.backupChoices(side)),
      ...(referenceChoices.length > 0
        ? [menuTitle(t("compare.references")), ...referenceChoices]
        : []),
    );
    this.menuTarget.replaceChildren(menu);
  }

  /** A side's group: its newest Output, the Backup chosen now, nothing, and the Versions dialog. */
  private backupChoices(side: Side): HTMLLIElement[] {
    const language = side === "original" ? null : this.shownTranslation;
    const backups =
      this.versions.find((each) => each.language === language)?.backups ?? [];
    const files = [
      ...new Set([
        newestOutput(this.versions, language),
        this.fileBySide[side],
      ]),
    ].filter((file): file is string => file !== null);
    const radio = (value: string) => {
      const input = document.createElement("input");
      input.type = "radio";
      input.className = "radio radio-xs";
      input.name = `compare-${side}`;
      input.value = value;
      input.checked = (this.fileBySide[side] ?? "") === value;
      return input;
    };
    const versionsChoice = document.createElement("button");
    versionsChoice.type = "button";
    versionsChoice.dataset.action = "comparison#chooseInVersions";
    versionsChoice.dataset.comparisonSideParam = side;
    versionsChoice.textContent = t("compare.chooseInVersions");
    const versionsItem = document.createElement("li");
    versionsItem.append(versionsChoice);
    return [
      menuTitle(this.sideName(side)),
      ...files.map((file) => {
        const backup = backups.find((each) => each.file === file);
        const label = backup
          ? `${t(`compare.${backup.kind}`)} ${localTime(backup.taken_at)}`
          : file;
        return menuChoice(radio(file), label);
      }),
      menuChoice(radio(""), t("compare.none")),
      versionsItem,
    ];
  }

  private async compare(): Promise<void> {
    const rowsBySide: Record<Side, ComparedRow[]> = {
      original: [],
      translation: [],
    };
    const cuesByLanguage: [string, ComparedCue[]][] = [];
    try {
      for (const side of ["original", "translation"] as Side[]) {
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
      notifyFailure(t("versions.unreadable"), error);
    }
    this.decorate(rowsBySide);
    this.showReferences(cuesByLanguage);
  }

  /** Clears the marks of the last comparison and puts those of each side's comparison on the rows. */
  private decorate(rowsBySide: Record<Side, ComparedRow[]>): void {
    for (const stale of this.listTarget.querySelectorAll(
      "[data-ghost], [data-marks], [data-was], [data-reference]",
    ))
      stale.remove();
    const items = [
      ...this.listTarget.querySelectorAll<HTMLLIElement>(
        ":scope > li:not([data-ghost])",
      ),
    ];
    const added: Range[] = [];
    for (const side of ["original", "translation"] as Side[]) {
      rowsBySide[side].forEach((row, index) => {
        if (row.kind === "removal") {
          this.showRemoval(row, index, items, side);
          return;
        }
        for (const cue of row.right) {
          const item = items.find((each) => isSameCue(cue, each));
          if (item) added.push(...this.markItem(item, row, index, side));
        }
      });
    }
    markRanges(ADDED_HIGHLIGHT, added);
  }

  /** Marks the row beside its side's text field, answering the ranges its text gained. */
  private markItem(
    item: HTMLLIElement,
    row: ComparedRow,
    index: number,
    side: Side,
  ): Range[] {
    const labels = markLabels(row);
    const field = item.querySelector<HTMLElement>(
      `.field.${FIELD_BY_SIDE[side]}`,
    );
    if (labels.length === 0 || !field) return [];
    const marks = document.createElement("div");
    marks.dataset.marks = side;
    marks.className = "flex items-center gap-1";
    marks.append(
      ...labels.map(badge),
      this.revertMenu(row, index, side, "dropdown-start"),
    );
    field.insertAdjacentElement("beforebegin", marks);
    if (!row.is_text_changed && row.kind === "pair") return [];
    field.insertAdjacentElement("afterend", earlierText(row));
    return addedRanges(field, row);
  }

  private showRemoval(
    row: ComparedRow,
    index: number,
    items: HTMLLIElement[],
    side: Side,
  ): void {
    const [first] = row.left;
    const ghost = document.createElement("li");
    ghost.dataset.ghost = side;
    ghost.className =
      "border border-dashed border-base-300 text-base-content/60";
    const time = document.createElement("time");
    time.textContent = formatTime(first.start_ms);
    const text = document.createElement("p");
    text.className = "list-col-grow text-sm";
    text.textContent = t("compare.removedFrom", {
      source: this.sideName(side),
      text: row.left.map((cue) => cue.text).join(" / "),
    });
    ghost.append(
      badge("compare.removedMark"),
      time,
      text,
      this.revertMenu(row, index, side, "dropdown-end"),
    );
    const next = items.find(
      (each) => (timeOf(each, "start") ?? 0) >= first.start_ms,
    );
    this.listTarget.insertBefore(ghost, next ?? null);
  }

  /** Shows beneath each Segment's texts the cue of each translation read, named by its Language. */
  private showReferences(cuesByLanguage: [string, ComparedCue[]][]): void {
    for (const item of this.listTarget.querySelectorAll<HTMLLIElement>(
      ":scope > li:not([data-ghost])",
    )) {
      const texts = item.querySelector(".field.text")?.parentElement;
      for (const [language, cues] of cuesByLanguage) {
        const cue = cues.find((each) => isSameCue(each, item));
        if (!cue || !texts) continue;
        const code = document.createElement("span");
        code.className = "badge badge-ghost badge-xs";
        code.textContent = language;
        const text = document.createElement("span");
        text.dataset.cue = "";
        text.textContent = cue.text;
        const reference = document.createElement("p");
        reference.dataset.reference = language;
        reference.className =
          "flex items-baseline gap-2 px-1.5 text-sm text-base-content/70";
        reference.append(code, text);
        texts.append(reference);
      }
    }
  }

  /** The take-back menu: the whole row, and for a Pair its text or its times alone where they changed. */
  private revertMenu(
    row: ComparedRow,
    index: number,
    side: Side,
    placement: "dropdown-start" | "dropdown-end",
  ): HTMLElement {
    const dropdown = document.createElement("div");
    dropdown.className = `dropdown ${placement}`;
    const opener = document.createElement("div");
    opener.tabIndex = 0;
    opener.setAttribute("role", "button");
    opener.className = "btn btn-square btn-ghost btn-xs";
    opener.title = t("compare.revert");
    opener.setAttribute("aria-label", t("compare.revert"));
    opener.append(iconElement("RotateCcw"));
    const menu = document.createElement("ul");
    menu.tabIndex = -1;
    menu.className =
      "menu dropdown-content z-10 w-40 rounded-box bg-base-100 shadow-md";
    const parts: [RevertPart, string][] = [["whole", "compare.revertWhole"]];
    if (row.kind === "pair" && row.is_text_changed)
      parts.push(["text", "compare.revertText"]);
    if (row.kind === "pair" && row.is_time_changed)
      parts.push(["times", "compare.revertTimes"]);
    for (const [part, label] of parts) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `revert-${part}`;
      button.dataset.action = "comparison#revert";
      button.dataset.comparisonRowParam = String(index);
      button.dataset.comparisonPartParam = part;
      button.dataset.comparisonSideParam = side;
      button.textContent = t(label);
      const choice = document.createElement("li");
      choice.append(button);
      menu.append(choice);
    }
    dropdown.append(opener, menu);
    return dropdown;
  }
}
