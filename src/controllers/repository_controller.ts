import { Controller } from "@hotwired/stimulus";
import {
  repositoryFiles,
  type ModelSlot,
  type RepositoryFile,
} from "../backend/toolchain";
import { t } from "../i18n";
import { failureMessage } from "../ui/failure";
import { sizeLabel } from "../ui/models";

/** A file picked from a Hugging Face Repository. */
export interface RepositoryPick {
  repo: string;
  file: string;
}

/**
 * The Repository dialog: lists the files of a Hugging Face Repository a Model Slot can load and
 * answers the one the user picks, or none when the dialog closes without one.
 */
export default class RepositoryController extends Controller {
  static targets = [
    "dialog",
    "title",
    "repo",
    "files",
    "hint",
    "downloadButton",
  ];

  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly titleTarget: HTMLElement;
  declare readonly repoTarget: HTMLInputElement;
  declare readonly filesTarget: HTMLElement;
  declare readonly hintTarget: HTMLElement;
  declare readonly downloadButtonTarget: HTMLButtonElement;

  private slot: ModelSlot = "transcription";
  private listedRepo: string | null = null;
  private answer: ((pick: RepositoryPick | null) => void) | null = null;
  private pickedFile: RepositoryPick | null = null;

  /** Opens the dialog for `slot`, answering the file the user picks, or none. */
  pick(slot: ModelSlot): Promise<RepositoryPick | null> {
    this.slot = slot;
    this.titleTarget.textContent = t("repository.title", {
      slot: t(`slots.${slot}`),
    });
    this.showFiles([]);
    this.showHint(null);
    this.dialogTarget.showModal();
    this.repoTarget.focus();
    return new Promise((resolve) => (this.answer = resolve));
  }

  async list(): Promise<void> {
    const repo = this.repoTarget.value.trim();
    if (repo === "") return;
    this.showFiles([]);
    this.showHint(null);
    try {
      const files = await repositoryFiles(repo, this.slot);
      this.listedRepo = repo;
      this.showFiles(files);
      if (files.length === 0)
        this.showHint(
          t("repository.noModel", { slot: t(`slots.${this.slot}`) }),
        );
    } catch (error) {
      this.showHint(failureMessage(error));
    }
  }

  chooseFile(): void {
    this.downloadButtonTarget.disabled = this.checkedFile() === null;
  }

  download(): void {
    const file = this.checkedFile();
    if (this.listedRepo === null || file === null) return;
    this.pickedFile = { repo: this.listedRepo, file };
    this.dialogTarget.close();
  }

  /** Answers what was picked once the dialog closes, however it closed. */
  settle(): void {
    this.answer?.(this.pickedFile);
    this.answer = null;
    this.pickedFile = null;
  }

  private checkedFile(): string | null {
    return (
      this.filesTarget.querySelector<HTMLInputElement>("input:checked")
        ?.value ?? null
    );
  }

  private showFiles(files: RepositoryFile[]): void {
    this.filesTarget.replaceChildren(
      ...files.map((file) => {
        const row = document.createElement("label");
        row.className = "list-row cursor-pointer items-center";
        const radio = Object.assign(document.createElement("input"), {
          type: "radio",
          name: "repository-file",
          className: "radio radio-sm",
          value: file.path,
        });
        const path = Object.assign(document.createElement("span"), {
          className: "break-all",
          textContent: file.path,
        });
        const size = Object.assign(document.createElement("span"), {
          className: "text-base-content/70 whitespace-nowrap",
          textContent: sizeLabel(file.size),
        });
        row.append(radio, path, size);
        return row;
      }),
    );
    this.filesTarget.hidden = files.length === 0;
    this.downloadButtonTarget.disabled = true;
  }

  private showHint(text: string | null): void {
    this.hintTarget.textContent = text ?? "";
    this.hintTarget.hidden = text === null;
  }
}
