import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { describeFailure } from "../failure";
import { t } from "../i18n";
import { describePhases, followProgress, type PhaseTiming } from "../progress";
import type { Segment } from "./transcript_controller";

export interface Translation {
  segments: Segment[];
  phases: PhaseTiming[];
}

export function translateSegments(
  segments: Segment[],
  target: string,
): Promise<Translation> {
  return invoke<Translation>("translate", { segments, target });
}

export default class TranslateController extends Controller {
  static targets = ["status", "language", "bar"];

  declare readonly statusTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;

  private unlisten?: UnlistenFn;
  private running = false;

  async connect(): Promise<void> {
    this.unlisten = await followProgress(
      this.statusTarget,
      this.bar(),
      () => this.running,
    );
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async choose(): Promise<void> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path !== null) await this.translate(path);
  }

  async translate(path: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.statusTarget.textContent = t("work.preparing");
    try {
      const segments = await invoke<Segment[]>("open_srt", { path });
      this.dispatch("loaded", { target: window, detail: { segments } });
      const translation = await translateSegments(
        segments,
        this.languageTarget.value,
      );
      this.dispatch("loaded", {
        target: window,
        detail: { segments: translation.segments },
      });
      this.statusTarget.textContent = `${t("translate.done")}\n${describePhases(translation.phases)}`;
    } catch (error) {
      this.statusTarget.textContent = t("work.failed", {
        reason: describeFailure(error),
      });
    } finally {
      this.running = false;
      this.bar()?.setAttribute("hidden", "");
    }
  }

  private bar(): HTMLProgressElement | undefined {
    return this.hasBarTarget ? this.barTarget : undefined;
  }
}
