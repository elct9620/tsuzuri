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
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { iconElement } from "../ui/icons";
import { notifyFailure } from "../ui/notification";
import { formatTime, localTime, parseTime } from "../ui/time";

/** A choice of the compare menu: the subtitle, as its Language or none, and the Backup's file. */
interface ComparedBackup {
  language: string | null;
  file: string;
}

/** A choice of the compare menu: a Backup to compare with, or a translation to read beside. */
type CompareChoice = ComparedBackup | { reference: string };

function choiceValue(backup: ComparedBackup): string {
  return JSON.stringify(backup);
}

function option(value: string, label: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = label;
  return choice;
}

/** The newest Output of the original, which the editor compares with unless another is chosen. */
function newestOutput(versions: SubtitleVersions[]): ComparedBackup | null {
  const original = versions.find((each) => each.language === null);
  const output = original?.backups.find((backup) => backup.kind === "output");
  return output ? { language: null, file: output.file } : null;
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

/**
 * Marks the editor's rows with how they differ from a Backup of the original or of the translation
 * shown, shows each removed cue in its place, and takes a row back from its menu.
 */
export default class ComparisonController extends Controller {
  static targets = ["choice", "list"];

  /** Which Backup the editor compares with, or none. */
  declare readonly choiceTarget: HTMLSelectElement;
  /** The editor's rows, which the transcript draws. */
  declare readonly listTarget: HTMLOListElement;

  /** The Current Resource the choices were made for, so a new one is compared afresh. */
  private resource: string | null = null;
  /** The newest Output of the original when the choices were last made, so a newer one is taken up. */
  private newestOutputFile: string | null = null;
  private rows: ComparedRow[] = [];

  /**
   * Compares the Segments just shown with the chosen Backup, offering the Backups there are now:
   * the newest Output of the original is chosen for a new Resource and once a newer one is kept.
   */
  async mark({
    detail,
  }: CustomEvent<{ project: ProjectView | null }>): Promise<void> {
    const project = detail.project;
    const resource = project?.current_resource ?? null;
    const versions = await this.readVersions(project);
    const chosen = this.choiceTarget.value;
    this.offerChoices(versions, project);
    const output = newestOutput(versions);
    const isFresh =
      resource !== this.resource ||
      (output?.file ?? null) !== this.newestOutputFile;
    const isStillOffered = [...this.choiceTarget.options].some(
      (choice) => choice.value === chosen,
    );
    this.choiceTarget.value =
      isFresh || !isStillOffered ? (output ? choiceValue(output) : "") : chosen;
    this.resource = resource;
    this.newestOutputFile = output?.file ?? null;
    await this.compare();
  }

  /** Compares with the Backup just chosen. */
  async choose(): Promise<void> {
    await this.compare();
  }

  /** Takes back the row a menu item belongs to, in the part it names. */
  async revert({
    currentTarget,
    params,
  }: {
    currentTarget: EventTarget | null;
    params: { row: number; part: RevertPart };
  }): Promise<void> {
    closeMenu(currentTarget);
    const chosen = this.chosenBackup();
    if (chosen === null) return;
    try {
      await revertRow(chosen.language, chosen.file, params.row, params.part);
    } catch (error) {
      notifyFailure(t("compare.notReverted"), error);
    }
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

  /**
   * Offers no Backup, each of the original and of the translation shown, and each other
   * translation to read beside the cues.
   */
  private offerChoices(
    versions: SubtitleVersions[],
    project: ProjectView | null,
  ): void {
    const shown = project?.shown_translation ?? null;
    const references = (currentResource(project)?.translation_languages ?? [])
      .filter((language) => language !== shown)
      .map((language) =>
        option(
          JSON.stringify({ reference: language }),
          t("compare.reference", { language: t(`languages.${language}`) }),
        ),
      );
    const choices = versions
      .filter((each) => each.language === null || each.language === shown)
      .flatMap((each) =>
        each.backups.map((backup) => {
          const subtitle =
            each.language === null
              ? t("compare.original")
              : t(`languages.${each.language}`);
          const kind = t(`compare.${backup.kind}`);
          return option(
            choiceValue({ language: each.language, file: backup.file }),
            `${subtitle} ${kind} ${localTime(backup.taken_at)}`,
          );
        }),
      );
    this.choiceTarget.replaceChildren(
      option("", t("compare.none")),
      ...choices,
      ...references,
    );
  }

  private chosenBackup(): ComparedBackup | null {
    const chosen = this.chosenValue();
    return chosen !== null && "file" in chosen ? chosen : null;
  }

  /** The Language of the translation chosen to read beside the cues, or none. */
  private chosenReference(): string | null {
    const chosen = this.chosenValue();
    return chosen !== null && "reference" in chosen ? chosen.reference : null;
  }

  private chosenValue(): CompareChoice | null {
    return this.choiceTarget.value
      ? (JSON.parse(this.choiceTarget.value) as CompareChoice)
      : null;
  }

  private async compare(): Promise<void> {
    const chosen = this.chosenBackup();
    const reference = this.chosenReference();
    this.rows = [];
    let cues: ComparedCue[] = [];
    try {
      if (chosen !== null)
        this.rows = await compareVersions(chosen.language, chosen.file, null);
      if (reference !== null) cues = await translationCues(reference);
    } catch (error) {
      notifyFailure(t("versions.unreadable"), error);
    }
    this.decorate(chosen?.language === null ? "text" : "translation");
    this.showReferences(cues);
  }

  /** Shows beneath the text of each Segment the cue of the translation read beside it with its times. */
  private showReferences(cues: ComparedCue[]): void {
    for (const item of this.listTarget.querySelectorAll<HTMLLIElement>(
      ":scope > li:not([data-ghost])",
    )) {
      const cue = cues.find((each) => isSameCue(each, item));
      if (!cue) continue;
      const reference = document.createElement("p");
      reference.dataset.reference = "";
      reference.className = "px-1.5 text-sm text-base-content/70";
      reference.textContent = cue.text;
      item
        .querySelector("textarea.text")
        ?.insertAdjacentElement("afterend", reference);
    }
  }

  /** Clears the marks of the last comparison and puts those of the current one on each row. */
  private decorate(field: "text" | "translation"): void {
    for (const stale of this.listTarget.querySelectorAll(
      "[data-ghost], [data-marks], [data-was], [data-reference]",
    ))
      stale.remove();
    const items = [
      ...this.listTarget.querySelectorAll<HTMLLIElement>(
        ":scope > li:not([data-ghost])",
      ),
    ];
    this.rows.forEach((row, index) => {
      if (row.kind === "removal") {
        this.showRemoval(row, index, items);
        return;
      }
      for (const cue of row.right) {
        const item = items.find((each) => isSameCue(cue, each));
        if (item) this.markItem(item, row, index, field);
      }
    });
  }

  private markItem(
    item: HTMLLIElement,
    row: ComparedRow,
    index: number,
    field: "text" | "translation",
  ): void {
    const labels = markLabels(row);
    if (labels.length === 0) return;
    const marks = document.createElement("div");
    marks.dataset.marks = "";
    marks.className = "flex items-center gap-1";
    marks.append(
      ...labels.map(badge),
      this.revertMenu(row, index, "dropdown-start"),
    );
    item.querySelector(".flex-col")?.prepend(marks);
    if (row.is_text_changed || row.kind !== "pair") {
      const was = document.createElement("p");
      was.dataset.was = "";
      was.className = "px-1.5 text-xs text-base-content/60";
      was.textContent = t("compare.was", {
        text: row.left.map((cue) => cue.text).join(" / ") || "—",
      });
      item
        .querySelector(`textarea.${field}`)
        ?.insertAdjacentElement("afterend", was);
    }
  }

  private showRemoval(
    row: ComparedRow,
    index: number,
    items: HTMLLIElement[],
  ): void {
    const [first] = row.left;
    const ghost = document.createElement("li");
    ghost.dataset.ghost = "";
    ghost.className =
      "border border-dashed border-base-300 text-base-content/60";
    const time = document.createElement("time");
    time.textContent = formatTime(first.start_ms);
    const text = document.createElement("p");
    text.className = "list-col-grow text-sm";
    text.textContent = t("compare.removed", {
      text: row.left.map((cue) => cue.text).join(" / "),
    });
    ghost.append(
      badge("compare.removedMark"),
      time,
      text,
      this.revertMenu(row, index, "dropdown-end"),
    );
    const next = items.find(
      (each) => (timeOf(each, "start") ?? 0) >= first.start_ms,
    );
    this.listTarget.insertBefore(ghost, next ?? null);
  }

  /** The take-back menu: the whole row, and for a Pair its text or its times alone where they changed. */
  private revertMenu(
    row: ComparedRow,
    index: number,
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
      button.textContent = t(label);
      const choice = document.createElement("li");
      choice.append(button);
      menu.append(choice);
    }
    dropdown.append(opener, menu);
    return dropdown;
  }
}
