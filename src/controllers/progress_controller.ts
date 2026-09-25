import { Controller } from "@hotwired/stimulus";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { t } from "../i18n";
import { notifyFailure } from "../notification";
import { followProgress } from "../progress";

/** The kind of task running, which the editor shows Placeholders for. */
export type TaskKind = "transcribe" | "translate";

/** The running task's progress above the editor, which the task dialogs report to; how it ended is a Notification. */
export default class ProgressController extends Controller {
  static targets = ["status", "bar"];

  declare readonly statusTarget: HTMLElement;
  declare readonly barTarget: HTMLProgressElement;

  private unlisten?: UnlistenFn;
  private isRunning = false;
  /** The task running now, which a failure is said to belong to. */
  private task: TaskKind = "transcribe";

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

  /** Starts showing `task`, or moves on to it within the same run, and announces it as `progress:task`. */
  begin(task: TaskKind): void {
    this.isRunning = true;
    this.task = task;
    this.element.removeAttribute("hidden");
    this.statusTarget.textContent = t("work.preparing");
    this.dispatch("task", { detail: { task } });
  }

  finish(): void {
    this.end();
  }

  /** Ends the run, saying the task running when it failed did not finish, and why. */
  fail(error: unknown): void {
    this.end();
    notifyFailure(t(`${this.task}.failed`), error);
  }

  private end(): void {
    this.isRunning = false;
    this.element.setAttribute("hidden", "");
    this.barTarget.hidden = true;
    this.dispatch("task", { detail: { task: null } });
  }
}
