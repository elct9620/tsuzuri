import { Controller } from "@hotwired/stimulus";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { failureMessage } from "../failure";
import { t } from "../i18n";
import { notify } from "../notification";
import { followProgress } from "../progress";

/** The running task's progress above the editor, which the task dialogs report to; how it ended is a Notification. */
export default class ProgressController extends Controller {
  static targets = ["status", "bar"];

  declare readonly statusTarget: HTMLElement;
  declare readonly barTarget: HTMLProgressElement;

  private unlisten?: UnlistenFn;
  private isRunning = false;

  async connect(): Promise<void> {
    this.unlisten = await followProgress(
      this.statusTarget,
      this.barTarget,
      () => this.isRunning,
    );
  }

  disconnect(): void {
    this.unlisten?.();
  }

  /** Whether a task is running, so no second one starts. */
  get isBusy(): boolean {
    return this.isRunning;
  }

  begin(): void {
    this.isRunning = true;
    this.element.removeAttribute("hidden");
    this.statusTarget.textContent = t("work.preparing");
  }

  finish(lines: string[]): void {
    this.end();
    notify(lines.join("\n"), "success");
  }

  fail(error: unknown): void {
    this.end();
    notify(t("work.failed", { reason: failureMessage(error) }), "error");
  }

  private end(): void {
    this.isRunning = false;
    this.element.setAttribute("hidden", "");
    this.barTarget.hidden = true;
  }
}
