import { Controller } from "@hotwired/stimulus";

import {
  compareVersions,
  restoreVersion,
  revertRow,
  subtitleVersions,
  type Backup,
  type ComparedCue,
  type ComparedRow,
  type Restoration,
  type SubtitleVersions,
  type TextSpan,
} from "../backend/project";
import { t } from "../i18n";
import { notifyFailure, notifyRestoration } from "../ui/notification";
import { iconElement } from "../ui/icons";
import { formatTime, localTime } from "../ui/time";

function option(value: string, label: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = label;
  return choice;
}

function button(
  label: string,
  action: string,
  file: string,
): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = `${action} btn btn-xs`;
  control.dataset.file = file;
  control.dataset.action = `versions#${action}`;
  control.textContent = t(label);
  return control;
}

/** The texts of one side of a row, a line each, or a dash where that side has none. */
function texts(cues: ComparedCue[]): string {
  return cues.length === 0 ? "—" : cues.map((cue) => cue.text).join("\n");
}

function isDifferent(row: ComparedRow): boolean {
  return row.kind !== "pair" || row.is_text_changed || row.is_time_changed;
}

/** One side of a Pair's text, its characters marked where only that side has them. */
function spansCell(
  spans: TextSpan[],
  own: "removal" | "addition",
): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = "whitespace-pre-line";
  for (const span of spans) {
    if (span.kind !== "common" && span.kind !== own) continue;
    const text = document.createElement("span");
    text.textContent = span.text;
    if (span.kind !== "common") {
      text.dataset.span = span.kind;
      text.className =
        span.kind === "removal" ? "bg-error/20 line-through" : "bg-success/20";
    }
    td.append(text);
  }
  return td;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = "whitespace-pre-line";
  td.textContent = text;
  return td;
}

/** The Versions of the Current Resource's subtitles: their Backups, a comparison of two, and restoring one. */
export default class VersionsController extends Controller {
  static targets = [
    "dialog",
    "subtitle",
    "backups",
    "comparison",
    "left",
    "right",
    "rows",
    "onlyDifferences",
  ];

  declare readonly dialogTarget: HTMLDialogElement;
  /** Which subtitle's Versions are shown: the original, or a translation by its Language code. */
  declare readonly subtitleTarget: HTMLSelectElement;
  declare readonly backupsTarget: HTMLUListElement;
  declare readonly comparisonTarget: HTMLElement;
  declare readonly leftTarget: HTMLSelectElement;
  declare readonly rightTarget: HTMLSelectElement;
  declare readonly rowsTarget: HTMLTableSectionElement;
  /** Whether rows that do not differ are hidden. */
  declare readonly onlyDifferencesTarget: HTMLInputElement;

  /** What Rust listed when the dialog opened; shown until it closes. */
  private versions: SubtitleVersions[] = [];

  async open(): Promise<void> {
    try {
      this.versions = await subtitleVersions();
    } catch (error) {
      notifyFailure(t("versions.unreadable"), error);
      return;
    }
    this.subtitleTarget.replaceChildren(
      ...this.versions.map(({ language }) =>
        option(
          language ?? "",
          language ? t(`languages.${language}`) : t("versions.original"),
        ),
      ),
    );
    this.showBackups();
    this.dialogTarget.showModal();
  }

  /** Opens the dialog at the Versions of the subtitle in `language`, or of the original for none. */
  async openAt(language: string | null): Promise<void> {
    await this.open();
    this.subtitleTarget.value = language ?? "";
    this.showBackups();
  }

  /** Hands the editor a Backup to compare with, as `versions:compare-with`, and closes. */
  setComparison({ params }: { params: { file: string } }): void {
    this.dispatch("compare-with", {
      detail: {
        language: this.subtitleTarget.value || null,
        file: params.file,
      },
    });
    this.dialogTarget.close();
  }

  showBackups(): void {
    const backups = this.shownBackups();
    const now = document.createElement("li");
    now.className = "list-row";
    now.textContent = t("versions.now");
    this.backupsTarget.replaceChildren(
      now,
      ...backups.map(({ file, taken_at, kind }) => {
        const li = document.createElement("li");
        li.className = "list-row items-center";
        const label = document.createElement("span");
        label.className = "kind badge badge-sm";
        label.textContent = t(`compare.${kind}`);
        const time = document.createElement("span");
        time.className = "list-col-grow";
        time.textContent = localTime(taken_at);
        const comparison = document.createElement("button");
        comparison.type = "button";
        comparison.className = "set-comparison btn btn-xs";
        comparison.dataset.action = "versions#setComparison";
        comparison.dataset.versionsFileParam = file;
        comparison.textContent = t("versions.setComparison");
        li.append(
          label,
          time,
          comparison,
          button("versions.compare", "compare", file),
          button("versions.restore", "restore", file),
        );
        return li;
      }),
    );
    const choices = () => [
      option("", t("versions.now")),
      ...backups.map(({ file, taken_at }) => option(file, localTime(taken_at))),
    ];
    this.leftTarget.replaceChildren(...choices());
    this.rightTarget.replaceChildren(...choices());
    this.comparisonTarget.hidden = true;
  }

  async compare({ currentTarget }: Event): Promise<void> {
    this.leftTarget.value = (currentTarget as HTMLElement).dataset.file!;
    this.rightTarget.value = "";
    await this.showComparison();
  }

  /** Asks Rust to line the two chosen Versions up by time, marking each row that differs. */
  async showComparison(): Promise<void> {
    let rows: ComparedRow[];
    try {
      rows = await compareVersions(
        this.shownLanguage(),
        this.leftTarget.value || null,
        this.rightTarget.value || null,
      );
    } catch (error) {
      notifyFailure(t("versions.unreadable"), error);
      return;
    }
    const isRevertible =
      this.leftTarget.value !== "" && this.rightTarget.value === "";
    this.rowsTarget.replaceChildren(
      ...rows.map((row, index) => {
        const isChanged = isDifferent(row);
        const tr = document.createElement("tr");
        tr.classList.toggle("changed", isChanged);
        tr.classList.toggle("bg-warning/15", isChanged);
        const start = Math.min(
          ...[...row.left, ...row.right].map((cue) => cue.start_ms),
        );
        const hasSpans = row.text_spans.length > 0;
        tr.append(
          cell(formatTime(start)),
          hasSpans
            ? spansCell(row.text_spans, "removal")
            : cell(texts(row.left)),
          hasSpans
            ? spansCell(row.text_spans, "addition")
            : cell(texts(row.right)),
          this.revertCell(isChanged && isRevertible, index),
        );
        return tr;
      }),
    );
    this.showOnlyDifferences();
    this.comparisonTarget.hidden = false;
  }

  /** Hides the rows that do not differ while only the differences are asked for. */
  showOnlyDifferences(): void {
    const isFiltered = this.onlyDifferencesTarget.checked;
    for (const tr of this.rowsTarget.querySelectorAll("tr"))
      tr.hidden = isFiltered && !tr.classList.contains("changed");
  }

  moveToNextDifference(): void {
    this.moveToDifference(1);
  }

  moveToPreviousDifference(): void {
    this.moveToDifference(-1);
  }

  /** Takes back the row a take-back button belongs to, from the Backup on the left, and compares again. */
  async revert({ params }: { params: { row: number } }): Promise<void> {
    let restoration: Restoration;
    try {
      restoration = await revertRow(
        this.shownLanguage(),
        this.leftTarget.value,
        params.row,
        "whole",
      );
    } catch (error) {
      notifyFailure(t("compare.notReverted"), error);
      return;
    }
    notifyRestoration(t("compare.reverted"), restoration);
    await this.showComparison();
  }

  /** Marks the row that differs `step` rows of difference away from the current one as current. */
  private moveToDifference(step: 1 | -1): void {
    const differences = [
      ...this.rowsTarget.querySelectorAll<HTMLTableRowElement>("tr.changed"),
    ];
    if (differences.length === 0) return;
    const current = differences.findIndex((tr) =>
      tr.hasAttribute("data-current"),
    );
    const next =
      current === -1
        ? step === 1
          ? 0
          : differences.length - 1
        : (current + step + differences.length) % differences.length;
    differences[current]?.removeAttribute("data-current");
    differences[current]?.classList.replace("bg-info/20", "bg-warning/15");
    differences[next].setAttribute("data-current", "");
    differences[next].classList.replace("bg-warning/15", "bg-info/20");
    differences[next].scrollIntoView?.({ block: "nearest" });
  }

  private revertCell(isShown: boolean, index: number): HTMLTableCellElement {
    const td = document.createElement("td");
    if (!isShown) return td;
    const control = document.createElement("button");
    control.type = "button";
    control.className = "revert btn btn-square btn-ghost btn-xs";
    control.title = t("compare.revertWhole");
    control.setAttribute("aria-label", t("compare.revertWhole"));
    control.dataset.action = "versions#revert";
    control.dataset.versionsRowParam = String(index);
    control.append(iconElement("RotateCcw"));
    td.append(control);
    return td;
  }

  async restore({ currentTarget }: Event): Promise<void> {
    let restoration: Restoration;
    try {
      restoration = await restoreVersion(
        this.shownLanguage(),
        (currentTarget as HTMLElement).dataset.file,
      );
    } catch (error) {
      notifyFailure(t("versions.notRestored"), error);
      return;
    }
    this.dialogTarget.close();
    notifyRestoration(
      t("versions.restored"),
      restoration,
      t("versions.replacedKept"),
    );
  }

  private shownLanguage(): string | null {
    return this.subtitleTarget.value || null;
  }

  private shownBackups(): Backup[] {
    const language = this.shownLanguage();
    return (
      this.versions.find((versions) => versions.language === language)
        ?.backups ?? []
    );
  }
}
