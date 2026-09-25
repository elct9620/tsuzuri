import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";

import { failureMessage } from "../failure";
import { t } from "../i18n";

/** The Translation Glossary laid out for editing, named as Rust names it. */
export interface GlossaryTable {
  languages: string[];
  rows: string[][];
  has_source_target_header: boolean;
}

/** The glossary dialog: every Language a column and every term a row of fields, saved to `glossary.csv`. */
export default class GlossaryController extends Controller {
  static targets = [
    "open",
    "dialog",
    "languages",
    "rows",
    "warning",
    "failure",
    "save",
  ];

  declare readonly dialogTarget: HTMLDialogElement;
  /** The header row, naming the Language of each column. */
  declare readonly languagesTarget: HTMLTableRowElement;
  declare readonly rowsTarget: HTMLTableSectionElement;
  /** Warns that a `source,target` header is written as Language codes. */
  declare readonly warningTarget: HTMLElement;
  /** Says why the glossary could not be read or saved. */
  declare readonly failureTarget: HTMLElement;
  /** Usable only once the glossary was read, so a file that could not be read is never saved over. */
  declare readonly saveTarget: HTMLButtonElement;

  private languages: string[] = [];

  async open(): Promise<void> {
    this.failureTarget.hidden = true;
    try {
      this.show(await invoke<GlossaryTable>("translation_glossary_table"));
      this.saveTarget.disabled = false;
    } catch (error) {
      this.show({ languages: [], rows: [], has_source_target_header: false });
      this.saveTarget.disabled = true;
      this.fail(error);
    }
    this.dialogTarget.showModal();
  }

  addRow(): void {
    this.rowsTarget.append(this.row(this.languages.map(() => "")));
  }

  removeRow(event: Event): void {
    (event.currentTarget as HTMLElement).closest("tr")?.remove();
  }

  async save(): Promise<void> {
    const rows = [...this.rowsTarget.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll("input")].map((input) => input.value),
    );
    try {
      await invoke("save_translation_glossary", { rows });
      this.dialogTarget.close();
    } catch (error) {
      this.fail(error);
    }
  }

  private show(table: GlossaryTable): void {
    this.languages = table.languages;
    const cells = table.languages.map((code) => {
      const cell = document.createElement("th");
      cell.textContent = t(`languages.${code}`);
      return cell;
    });
    this.languagesTarget.replaceChildren(
      ...cells,
      document.createElement("th"),
    );
    this.rowsTarget.replaceChildren(...table.rows.map((row) => this.row(row)));
    this.warningTarget.hidden = !table.has_source_target_header;
  }

  private row(words: string[]): HTMLTableRowElement {
    const row = document.createElement("tr");
    for (const word of words) {
      const input = document.createElement("input");
      input.className = "input input-sm w-full min-w-32";
      input.value = word;
      const cell = document.createElement("td");
      cell.append(input);
      row.append(cell);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-sm";
    remove.textContent = "×";
    remove.setAttribute("aria-label", t("glossary.removeRow"));
    remove.dataset.action = "glossary#removeRow";
    const cell = document.createElement("td");
    cell.append(remove);
    row.append(cell);
    return row;
  }

  private fail(error: unknown): void {
    this.failureTarget.textContent = failureMessage(error);
    this.failureTarget.hidden = false;
  }
}
