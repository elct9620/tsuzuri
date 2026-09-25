import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";

import { interfaceLanguageCode, t } from "../i18n";
import { notify, notifyFailure } from "../notification";
import { formatTime } from "../time";

/** A Backup as Rust lists it: its file name in the history and the UTC time it was taken. */
interface Backup {
  file: string;
  /** `YYYYMMDDTHHMMSSZ` */
  taken_at: string;
}

/** The Backups of the original, with no Language, or of one translation. */
interface SubtitleVersions {
  language: string | null;
  backups: Backup[];
}

interface ComparedRow {
  start_ms: number;
  end_ms: number;
  left: string | null;
  right: string | null;
  is_changed: boolean;
}

/** `taken_at` in the local time of the interface language, as a person reads the time. */
export function localTime(takenAt: string): string {
  const [, year, month, day, hour, minute, second] =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(takenAt)!.map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  ).toLocaleString(interfaceLanguageCode());
}

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
  ];

  declare readonly dialogTarget: HTMLDialogElement;
  /** Which subtitle's Versions are shown: the original, or a translation by its Language code. */
  declare readonly subtitleTarget: HTMLSelectElement;
  declare readonly backupsTarget: HTMLUListElement;
  declare readonly comparisonTarget: HTMLElement;
  declare readonly leftTarget: HTMLSelectElement;
  declare readonly rightTarget: HTMLSelectElement;
  declare readonly rowsTarget: HTMLTableSectionElement;

  /** What Rust listed when the dialog opened; shown until it closes. */
  private versions: SubtitleVersions[] = [];

  async open(): Promise<void> {
    try {
      this.versions = await invoke<SubtitleVersions[]>("subtitle_versions");
    } catch (error) {
      notifyFailure(error);
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

  showBackups(): void {
    const backups = this.shownBackups();
    const now = document.createElement("li");
    now.className = "list-row";
    now.textContent = t("versions.now");
    this.backupsTarget.replaceChildren(
      now,
      ...backups.map(({ file, taken_at }) => {
        const li = document.createElement("li");
        li.className = "list-row items-center";
        const time = document.createElement("span");
        time.className = "list-col-grow";
        time.textContent = localTime(taken_at);
        li.append(
          time,
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
      rows = await invoke<ComparedRow[]>("compare_versions", {
        language: this.shownLanguage(),
        left: this.leftTarget.value || null,
        right: this.rightTarget.value || null,
      });
    } catch (error) {
      notifyFailure(error);
      return;
    }
    this.rowsTarget.replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement("tr");
        tr.classList.toggle("changed", row.is_changed);
        tr.classList.toggle("bg-warning/15", row.is_changed);
        tr.append(
          cell(formatTime(row.start_ms)),
          cell(row.left ?? "—"),
          cell(row.right ?? "—"),
        );
        return tr;
      }),
    );
    this.comparisonTarget.hidden = false;
  }

  async restore({ currentTarget }: Event): Promise<void> {
    try {
      await invoke("restore_version", {
        language: this.shownLanguage(),
        backup: (currentTarget as HTMLElement).dataset.file,
      });
    } catch (error) {
      notifyFailure(error);
      return;
    }
    this.dialogTarget.close();
    notify(t("versions.restored"), "success");
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
