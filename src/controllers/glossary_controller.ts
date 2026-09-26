import { Controller } from "@hotwired/stimulus";

import {
  saveTranslationGlossary,
  translationGlossaryTable,
  type GlossaryRow,
  type GlossaryTable,
} from "../backend/project";
import { t } from "../i18n";
import { iconElement } from "../ui/icons";
import { failureMessage } from "../ui/failure";

/** The glossary dialog: every Language a column and every term a row of fields with whether it names a Speaker, saved to `glossary.csv`. */
export default class GlossaryController extends Controller {
  static targets = [
    "dialog",
    "languages",
    "rows",
    "warning",
    "failure",
    "saveButton",
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
  declare readonly saveButtonTarget: HTMLButtonElement;

  private languages: string[] = [];

  async open(): Promise<void> {
    this.failureTarget.hidden = true;
    try {
      this.show(await translationGlossaryTable());
      this.saveButtonTarget.disabled = false;
    } catch (error) {
      this.show({ languages: [], rows: [], has_source_target_header: false });
      this.saveButtonTarget.disabled = true;
      this.fail(error);
    }
    this.dialogTarget.showModal();
  }

  addRow(): void {
    this.rowsTarget.append(
      this.row({ words: this.languages.map(() => ""), is_speaker: false }),
    );
  }

  removeRow(event: Event): void {
    (event.currentTarget as HTMLElement).closest("tr")?.remove();
  }

  async save(): Promise<void> {
    const rows = [...this.rowsTarget.querySelectorAll("tr")].map((row) => ({
      words: [
        ...row.querySelectorAll<HTMLInputElement>("input[type=text]"),
      ].map((input) => input.value),
      is_speaker:
        row.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked ??
        false,
    }));
    try {
      await saveTranslationGlossary(rows);
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
    const speaker = document.createElement("th");
    speaker.textContent = t("glossary.speaker");
    this.languagesTarget.replaceChildren(
      ...cells,
      speaker,
      document.createElement("th"),
    );
    this.rowsTarget.replaceChildren(...table.rows.map((row) => this.row(row)));
    this.warningTarget.hidden = !table.has_source_target_header;
  }

  private row({ words, is_speaker }: GlossaryRow): HTMLTableRowElement {
    const row = document.createElement("tr");
    for (const word of words) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "input input-sm w-full min-w-32";
      input.value = word;
      const cell = document.createElement("td");
      cell.append(input);
      row.append(cell);
    }
    const speaker = document.createElement("input");
    speaker.type = "checkbox";
    speaker.className = "checkbox checkbox-sm";
    speaker.checked = is_speaker;
    speaker.setAttribute("aria-label", t("glossary.speaker"));
    const speakerCell = document.createElement("td");
    speakerCell.append(speaker);
    row.append(speakerCell);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-square btn-ghost btn-sm";
    remove.append(iconElement("X"));
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
