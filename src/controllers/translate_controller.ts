import { Controller } from "@hotwired/stimulus";

import {
  currentResource,
  type ProjectView,
  type ProjectFeed,
} from "../backend/project";
import { translateSegments } from "../backend/translation";
import { t } from "../i18n";
import { notifyTranslation } from "../ui/notification";
import type ProgressController from "./progress_controller";
import type TranslationOptionsController from "./translation_options_controller";

/**
 * The translate dialog: it translates the Current Resource's original subtitle, or translates
 * chosen Segments again into the translation shown.
 */
export default class TranslateController extends Controller {
  static targets = [
    "openButton",
    "dialog",
    "title",
    "scopeField",
    "scope",
    "source",
    "overwriteWarning",
    "continuationHint",
    "startButton",
  ];
  static outlets = ["progress", "translation-options"];

  /** The toolbar button, usable only for a Current Resource with an original subtitle. */
  declare readonly openButtonTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly titleTarget: HTMLElement;
  /** The row naming the Segments translated again, shown only for them. */
  declare readonly scopeFieldTarget: HTMLElement;
  declare readonly scopeTarget: HTMLElement;
  /** Names the Primary Language it is translated from. */
  declare readonly sourceTarget: HTMLElement;
  /** Warns that the translation into the Language chosen will be overwritten. */
  declare readonly overwriteWarningTarget: HTMLElement;
  /** Warns that a line translated again may read as going on from the one before, which is left as it is. */
  declare readonly continuationHintTarget: HTMLElement;
  declare readonly startButtonTarget: HTMLButtonElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private project: ProjectView | null = null;
  /** The Segments to translate again, or none to translate the whole subtitle. */
  private chosenIndexes: number[] | null = null;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  open(): void {
    this.chosenIndexes = null;
    this.showDialog();
  }

  /** Opens the dialog to translate the Segments at `indexes` again; bound to `segment-changes:retranslate`. */
  openForSegments({ detail }: CustomEvent<{ indexes: number[] }>): void {
    this.chosenIndexes = detail.indexes;
    this.showDialog();
  }

  /** Warns, and names the start button for, whether the Language chosen is already translated. */
  showOverwrite({ detail }: CustomEvent<{ isOverwriting: boolean }>): void {
    // Translating chosen Segments again is one step to undo, so it overwrites nothing to warn of.
    const isOverwriting = detail.isOverwriting && this.chosenIndexes === null;
    this.overwriteWarningTarget.hidden = !isOverwriting;
    this.startButtonTarget.textContent = t(
      isOverwriting ? "translate.overwriteAndStart" : "translate.start",
    );
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy || !this.translationOptionsOutlet.reportValidity())
      return;
    this.dialogTarget.close();
    progress.begin("translation");
    try {
      const choices = this.translationOptionsOutlet;
      notifyTranslation(
        await translateSegments(
          choices.language,
          choices.options,
          this.chosenIndexes,
        ),
      );
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }

  private showDialog(): void {
    const indexes = this.chosenIndexes;
    this.titleTarget.textContent = t(
      indexes === null ? "toolbar.translate" : "translate.again",
    );
    this.scopeFieldTarget.hidden = indexes === null;
    this.continuationHintTarget.hidden = indexes === null;
    if (indexes !== null)
      this.scopeTarget.textContent =
        indexes.length === 1
          ? t("translate.scopeSegment", { number: indexes[0] + 1 })
          : t("translate.scopeChecked", { count: indexes.length });
    if (this.project !== null) {
      this.sourceTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(
        this.project,
        indexes === null ? null : this.project.shown_translation,
      );
    }
    this.dialogTarget.showModal();
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openButtonTarget.disabled = !(
      currentResource(project)?.has_subtitle ?? false
    );
  }
}
