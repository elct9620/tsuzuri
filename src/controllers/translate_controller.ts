import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { failureMessage } from "../failure";
import { t } from "../i18n";
import { phasesSummary, followProgress, type PhaseTiming } from "../progress";
import {
  followProject,
  type ProjectView,
  type TranslationGlossaryView,
} from "../project";

export interface Translation {
  phases: PhaseTiming[];
}

/** The choices the Translate panel offers, named as Rust names them. */
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

/** Translates the Project Rust holds; the translations land there, not in the answer. */
export function translateProject(
  source: string,
  target: string,
  options: TranslationOptions = DEFAULT_OPTIONS,
): Promise<Translation> {
  return invoke<Translation>("translate", { source, target, options });
}

function glossaryLabel(glossary: TranslationGlossaryView | null): string {
  if (glossary === null) return t("translate.glossaryNone");
  const file = glossary.file.split(/[\\/]/).pop() ?? glossary.file;
  return t("translate.glossaryLoaded", { file, count: glossary.term_count });
}

export default class TranslateController extends Controller {
  static targets = [
    "status",
    "source",
    "language",
    "speakerLabels",
    "selfReview",
    "summary",
    "summaryWords",
    "bar",
    "start",
    "glossary",
    "chooseGlossary",
    "clearGlossary",
  ];

  declare readonly statusTarget: HTMLElement;
  /** The Language the Project is translated from, following the Project's own until changed. */
  declare readonly sourceTarget: HTMLSelectElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly speakerLabelsTarget: HTMLInputElement;
  declare readonly selfReviewTarget: HTMLInputElement;
  declare readonly summaryTarget: HTMLInputElement;
  declare readonly summaryWordsTarget: HTMLInputElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;
  declare readonly startTarget: HTMLButtonElement;
  /** Names the Project's Translation Glossary, with its two actions beside it. */
  declare readonly glossaryTarget: HTMLElement;
  declare readonly chooseGlossaryTarget: HTMLButtonElement;
  declare readonly clearGlossaryTarget: HTMLButtonElement;

  private unlisteners: UnlistenFn[] = [];
  private isRunning = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await followProgress(this.statusTarget, this.bar(), () => this.isRunning),
      await followProject((project) => this.show(project)),
    );
  }

  disconnect(): void {
    for (const unlisten of this.unlisteners) unlisten();
    this.unlisteners = [];
  }

  async translate(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.statusTarget.textContent = t("work.preparing");
    try {
      const translation = await translateProject(
        this.sourceTarget.value,
        this.languageTarget.value,
        this.options(),
      );
      this.statusTarget.textContent = `${t("translate.done")}\n${phasesSummary(translation.phases)}`;
      this.dispatch("finished");
    } catch (error) {
      this.statusTarget.textContent = t("work.failed", {
        reason: failureMessage(error),
      });
    } finally {
      this.isRunning = false;
      this.bar()?.setAttribute("hidden", "");
    }
  }

  async chooseGlossary(): Promise<void> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (path === null) return;
    await this.runGlossaryCommand("load_glossary", { path });
  }

  async clearGlossary(): Promise<void> {
    await this.runGlossaryCommand("clear_glossary", {});
  }

  private async runGlossaryCommand(
    command: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    try {
      await invoke(command, args);
    } catch (error) {
      this.statusTarget.textContent = t("work.failed", {
        reason: failureMessage(error),
      });
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
    this.startTarget.disabled = project === null;
    if (project !== null) this.sourceTarget.value = project.language;
    const glossary = project?.translation_glossary ?? null;
    this.glossaryTarget.textContent = glossaryLabel(glossary);
    this.chooseGlossaryTarget.disabled = project === null;
    this.clearGlossaryTarget.disabled = glossary === null;
  }

  private bar(): HTMLProgressElement | undefined {
    return this.hasBarTarget ? this.barTarget : undefined;
  }
}
