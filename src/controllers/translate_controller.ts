import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { t } from "../i18n";
import { phasesSummary, type PhaseTiming } from "../progress";
import { currentResource, followProject, type ProjectView } from "../project";
import type ProgressController from "./progress_controller";
import type TranslationOptionsController from "./translation_options_controller";
import type { TranslationOptions } from "./translation_options_controller";

export interface Translation {
  phases: PhaseTiming[];
}

/** Translates the Current Resource from the Primary Language; the translations land in the Project, not in the answer. */
export function translateProject(
  target: string,
  options: TranslationOptions,
): Promise<Translation> {
  return invoke<Translation>("translate", { target, options });
}

/** The translate dialog: it translates the Current Resource's original subtitle. */
export default class TranslateController extends Controller {
  static targets = ["open", "dialog", "source"];
  static outlets = ["progress", "translation-options"];

  /** The toolbar button, usable only for a Current Resource with an original subtitle. */
  declare readonly openTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  /** Names the Primary Language it is translated from. */
  declare readonly sourceTarget: HTMLElement;
  declare readonly progressOutlet: ProgressController;
  declare readonly translationOptionsOutlet: TranslationOptionsController;

  private unlisten?: UnlistenFn;
  private project: ProjectView | null = null;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  open(): void {
    if (this.project !== null) {
      this.sourceTarget.textContent = t(`languages.${this.project.language}`);
      this.translationOptionsOutlet.show(this.project);
    }
    this.dialogTarget.showModal();
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    this.dialogTarget.close();
    progress.begin();
    try {
      const choices = this.translationOptionsOutlet;
      const translation = await translateProject(
        choices.language,
        choices.options,
      );
      progress.finish([t("translate.done"), phasesSummary(translation.phases)]);
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
