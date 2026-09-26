import { Controller } from "@hotwired/stimulus";

import {
  cancelTask,
  listenProgress,
  type PipelineProgress,
  type UnlistenFn,
} from "../backend/progress";
import { t } from "../i18n";
import { iconElement } from "../ui/icons";
import { failureCode } from "../ui/failure";
import { notify, notifyFailure } from "../ui/notification";
import {
  phaseLabel,
  progressLine,
  progressSummary,
  type TaskKind,
} from "../ui/progress";

/** The Phases each task goes through, in the order Rust enters them. */
const PHASES_BY_TASK: Record<TaskKind, string[]> = {
  transcription: ["prepare", "convert", "load", "transcribe"],
  translation: ["prepare", "load", "detect", "translate"],
};

/** Where each task's messages are kept: under the dialog that starts it. */
const MESSAGES_BY_TASK: Record<TaskKind, string> = {
  transcription: "transcribe",
  translation: "translate",
};

/**
 * Marks a step by where it stands from the Phase running: before it done with a check, at it
 * running with a spinner and `aria-current`, after it plain.
 */
function markStep(step: HTMLElement, fromRunning: number): void {
  step.classList.toggle("step-primary", fromRunning <= 0);
  step.querySelector(".step-icon")?.remove();
  if (fromRunning === 0) step.setAttribute("aria-current", "step");
  else step.removeAttribute("aria-current");
  if (fromRunning > 0) return;
  const icon = document.createElement("span");
  icon.className = "step-icon";
  if (fromRunning === 0) {
    const spinner = document.createElement("span");
    spinner.className = "loading loading-spinner loading-xs";
    icon.append(spinner);
  } else {
    icon.append(iconElement("Check", "size-3"));
  }
  step.prepend(icon);
}

/** The running task's progress above the editor, which the task dialogs report to; how it ended is a Notification. */
export default class ProgressController extends Controller {
  static targets = ["summary", "steps", "status", "bar"];

  /** The Phase and percentage the heading shows while the details stay folded. */
  declare readonly summaryTarget: HTMLElement;
  declare readonly stepsTarget: HTMLUListElement;
  declare readonly statusTarget: HTMLElement;
  declare readonly barTarget: HTMLProgressElement;

  private unlisten?: UnlistenFn;
  private isRunning = false;
  /** The task running now, which a failure is said to belong to. */
  private task: TaskKind = "transcription";

  async connect(): Promise<void> {
    this.unlisten = await listenProgress((progress) => this.show(progress));
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
    this.summaryTarget.textContent = t("work.preparing");
    this.stepsTarget.replaceChildren(
      ...PHASES_BY_TASK[task].map((phase) => {
        const step = document.createElement("li");
        step.className = "step";
        step.dataset.phase = phase;
        step.textContent = phaseLabel(phase);
        return step;
      }),
    );
    this.dispatch("task", { detail: { task } });
  }

  finish(): void {
    this.end();
  }

  /** Ends the run, saying the task running when it failed did not finish, and why; one given up says only that. */
  fail(error: unknown): void {
    this.end();
    if (failureCode(error) === "mode-cancelled")
      notify({
        title: t(`${MESSAGES_BY_TASK[this.task]}.cancelled`),
        kind: "warning",
      });
    else notifyFailure(t(`${MESSAGES_BY_TASK[this.task]}.failed`), error);
  }

  /** Asks the running task to stop; it ends through `fail` once it has. */
  async cancel(): Promise<void> {
    await cancelTask();
  }

  /** Shows the Phase just reported as the one running, every Phase before it as done. */
  private show(progress: PipelineProgress): void {
    if (!this.isRunning) return;
    this.statusTarget.textContent = progressLine(progress);
    this.summaryTarget.textContent = progressSummary(progress);
    this.barTarget.hidden = false;
    if (progress.percent === null) this.barTarget.removeAttribute("value");
    else this.barTarget.value = progress.percent;
    const steps = [...this.stepsTarget.children] as HTMLElement[];
    const reachedIndex = steps.findIndex(
      (step) => step.dataset.phase === progress.phase,
    );
    steps.forEach((step, index) => markStep(step, index - reachedIndex));
  }

  private end(): void {
    this.isRunning = false;
    this.element.setAttribute("hidden", "");
    this.barTarget.hidden = true;
    this.dispatch("task", { detail: { task: null } });
  }
}
