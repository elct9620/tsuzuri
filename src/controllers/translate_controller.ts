import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { failureMessage } from "../failure";
import { t } from "../i18n";
import { phasesSummary, followProgress, type PhaseTiming } from "../progress";
import { currentProject, followProject } from "../project";

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

export default class TranslateController extends Controller {
  static targets = ["status", "language", "bar", "start"];

  declare readonly statusTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;
  declare readonly startTarget: HTMLButtonElement;

  private unlisteners: UnlistenFn[] = [];
  private isRunning = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await followProgress(this.statusTarget, this.bar(), () => this.isRunning),
      await followProject((project) => {
        this.startTarget.disabled = project === null;
      }),
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

  private bar(): HTMLProgressElement | undefined {
    return this.hasBarTarget ? this.barTarget : undefined;
  }
}
