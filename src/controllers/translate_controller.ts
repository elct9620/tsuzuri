import { Controller } from "@hotwired/stimulus";

import {
  currentResource,
  type ProjectView,
  type ProjectFeed,
} from "../backend/project";
import { translate } from "../backend/translation";
import { t } from "../i18n";
import { notifyTranslation } from "../ui/notification";
import type ProgressController from "./progress_controller";
import type TranslationOptionsController from "./translation_options_controller";

/** The translate dialog: it translates the Current Resource's original subtitle. */
export default class TranslateController extends Controller {
  static targets = ["open", "dialog", "source", "overwrite", "start"];
  static outlets = ["progress", "translation-options"];

  /** The toolbar button, usable only for a Current Resource with an original subtitle. */
  declare readonly openTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  /** Names the Primary Language it is translated from. */
  declare readonly sourceTarget: HTMLElement;
  /** Warns that the translation into the Language chosen will be overwritten. */
  declare readonly overwriteTarget: HTMLElement;
  declare readonly startTarget: HTMLButtonElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;

  declare readonly feed: ProjectFeed;

  private unfollow?: () => void;
  private project: ProjectView | null = null;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  open(): void {
    if (this.project !== null) {
      this.sourceTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(this.project);
    }
    this.dialogTarget.showModal();
  }

  /** Warns, and names the start button for, whether the Language chosen is already translated. */
  showOverwrite({ detail }: CustomEvent<{ isOverwriting: boolean }>): void {
    this.overwriteTarget.hidden = !detail.isOverwriting;
    this.startTarget.textContent = t(
      detail.isOverwriting ? "translate.overwriteAndStart" : "translate.start",
    );
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    this.dialogTarget.close();
    progress.begin("translation");
    try {
      const choices = this.translationOptionsOutlet;
      const translation = await translate(choices.language, choices.options);
      notifyTranslation(translation);
      progress.finish();
    } catch (error) {
      progress.fail(error);
    }
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openTarget.disabled = !(
      currentResource(project)?.has_subtitle ?? false
    );
  }
}
