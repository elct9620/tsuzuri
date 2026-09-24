import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { t } from "../i18n";
import { phasesSummary, type PhaseTiming } from "../progress";
import {
  currentResource,
  followProject,
  type ProjectView,
  type TranslationGlossaryView,
} from "../project";
import type ProgressController from "./progress_controller";

export interface Translation {
  phases: PhaseTiming[];
}

/** The choices the translate dialog offers, named as Rust names them. */
export interface TranslationOptions {
  has_speaker_labels: boolean;
  has_self_review: boolean;
  summary_word_limit: number | null;
}

const DEFAULT_OPTIONS: TranslationOptions = {
  has_speaker_labels: false,
  has_self_review: false,
  summary_word_limit: null,
};

/** Translates the Current Resource from the Primary Language; the translations land in the Project, not in the answer. */
export function translateProject(
  target: string,
  options: TranslationOptions = DEFAULT_OPTIONS,
): Promise<Translation> {
  return invoke<Translation>("translate", { target, options });
}

function glossaryLabel(glossary: TranslationGlossaryView | null): string {
  if (glossary === null) return t("translate.glossaryNone");
  const file = glossary.file.split(/[\\/]/).pop() ?? glossary.file;
  return t("translate.glossaryLoaded", { file, count: glossary.term_count });
}

/** The translate dialog: it translates the Current Resource's original subtitle. */
export default class TranslateController extends Controller {
  static targets = [
    "open",
    "dialog",
    "source",
    "language",
    "speakerLabels",
    "selfReview",
    "summary",
    "summaryWords",
    "glossary",
  ];
  static outlets = ["progress"];

  /** The toolbar button, usable only for a Current Resource with an original subtitle. */
  declare readonly openTarget: HTMLButtonElement;
  declare readonly dialogTarget: HTMLDialogElement;
  /** Names the Primary Language it is translated from. */
  declare readonly sourceTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly speakerLabelsTarget: HTMLInputElement;
  declare readonly selfReviewTarget: HTMLInputElement;
  declare readonly summaryTarget: HTMLInputElement;
  declare readonly summaryWordsTarget: HTMLInputElement;
  /** Names the Project's `glossary.csv` and how many terms it holds. */
  declare readonly glossaryTarget: HTMLElement;
  declare readonly progressOutlet: ProgressController;

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
      this.glossaryTarget.textContent = glossaryLabel(
        this.project.translation_glossary,
      );
      if (this.project.translation_language !== null)
        this.languageTarget.value = this.project.translation_language;
    }
    this.dialogTarget.showModal();
  }

  async start(): Promise<void> {
    const progress = this.progressOutlet;
    if (progress.isBusy) return;
    this.dialogTarget.close();
    progress.begin();
    try {
      const translation = await translateProject(
        this.languageTarget.value,
        this.options(),
      );
      progress.finish([t("translate.done"), phasesSummary(translation.phases)]);
    } catch (error) {
      progress.fail(error);
    }
  }

  private options(): TranslationOptions {
    return {
      has_speaker_labels: this.speakerLabelsTarget.checked,
      has_self_review: this.selfReviewTarget.checked,
      summary_word_limit: this.summaryTarget.checked
        ? Number(this.summaryWordsTarget.value)
        : null,
    };
  }

  private show(project: ProjectView | null): void {
    this.project = project;
    this.openTarget.disabled = !(
      currentResource(project)?.has_subtitle ?? false
    );
  }
}
