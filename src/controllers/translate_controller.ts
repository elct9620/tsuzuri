import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { failureMessage } from "../failure";
import { t } from "../i18n";
import { phasesSummary, followProgress, type PhaseTiming } from "../progress";
import {
  currentProject,
  followProject,
  type ProjectView,
  type TranslationGlossaryView,
} from "../project";

export interface Translation {
  phases: PhaseTiming[];
}

/** Translates the Project Rust holds; the translations land there, not in the answer. */
export function translateProject(
  source: string,
  target: string,
): Promise<Translation> {
  return invoke<Translation>("translate", { source, target });
}

function glossaryLabel(glossary: TranslationGlossaryView | null): string {
  if (glossary === null) return t("translate.glossaryNone");
  const file = glossary.file.split(/[\\/]/).pop() ?? glossary.file;
  return t("translate.glossaryLoaded", { file, count: glossary.term_count });
}

export default class TranslateController extends Controller {
  static targets = [
    "status",
    "language",
    "bar",
    "start",
    "glossary",
    "chooseGlossary",
    "clearGlossary",
  ];

  declare readonly statusTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;
  declare readonly startTarget: HTMLButtonElement;
  /** Names the Project's Translation Glossary, with its two actions beside it. */
  declare readonly glossaryTarget: HTMLElement;
  declare readonly hasGlossaryTarget: boolean;
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
      const project = await currentProject();
      const translation = await translateProject(
        project?.language ?? "",
        this.languageTarget.value,
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

  private show(project: ProjectView | null): void {
    this.startTarget.disabled = project === null;
    if (!this.hasGlossaryTarget) return;
    const glossary = project?.translation_glossary ?? null;
    this.glossaryTarget.textContent = glossaryLabel(glossary);
    this.chooseGlossaryTarget.disabled = project === null;
    this.clearGlossaryTarget.disabled = glossary === null;
  }

  private bar(): HTMLProgressElement | undefined {
    return this.hasBarTarget ? this.barTarget : undefined;
  }
}
