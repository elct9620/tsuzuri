/**
 * The task running now, shared by the dialogs that start one and the progress above the editor
 * that shows it.
 */

import {
  cancelTask,
  type Phase,
  type PipelineProgress,
} from "../backend/progress";
import { t } from "../i18n";
import { failureCode } from "../ui/failure";
import { notify, notifyFailure } from "../ui/notification";
import { progressLine, progressSummary, type TaskKind } from "../ui/progress";

/** Where each task's messages are kept: under the dialog that starts it. */
const MESSAGES_BY_TASK: Record<TaskKind, string> = {
  transcription: "transcribe",
  translation: "translate",
  diarization: "diarize",
};

/** The task running and how far it has come, from its first Phase reported to its end. */
export class TaskRun {
  /** The task running, or none. */
  task = $state<TaskKind | null>(null);
  /** The line reported last, in full. */
  status = $state("");
  /** The Phase and percentage, short enough for a button. */
  summary = $state("");
  /** The Phase reported last within the task, none before the first. */
  reachedPhase = $state<Phase | null>(null);
  /** The percentage reported last, none for a Phase that cannot tell. */
  percent = $state<number | null>(null);
  /** Whether a Phase has been reported since the run began, so a bar has something to show. */
  hasBar = $state(false);

  #listeners = new Set<(task: TaskKind | null) => void>();

  /** Whether a task is running, so no second one starts. */
  get isBusy(): boolean {
    return this.task !== null;
  }

  /** Starts showing `task`, or moves on to it within the same run. */
  begin(task: TaskKind): void {
    this.task = task;
    this.status = t("work.preparing");
    this.summary = t("work.preparing");
    this.reachedPhase = null;
    this.#tell(task);
  }

  finish(): void {
    this.#end();
  }

  /** Ends the run, saying the task running when it failed did not finish, and why; one given up says only that. */
  fail(error: unknown): void {
    const messages = MESSAGES_BY_TASK[this.task ?? "transcription"];
    this.#end();
    if (failureCode(error) === "mode-cancelled")
      notify({ title: t(`${messages}.cancelled`), kind: "warning" });
    else notifyFailure(t(`${messages}.failed`), error);
  }

  /** Asks the running task to stop; it ends through `fail` once it has. */
  async cancel(): Promise<void> {
    await cancelTask();
  }

  /** Shows the Phase just reported as the one running. */
  show(progress: PipelineProgress): void {
    if (!this.isBusy) return;
    this.status = progressLine(progress);
    this.summary = progressSummary(progress);
    this.reachedPhase = progress.phase;
    this.percent = progress.percent;
    this.hasBar = true;
  }

  /** Calls `listener` with the task each time one begins or the run ends, until the returned function is called. */
  onTask(listener: (task: TaskKind | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #end(): void {
    this.task = null;
    this.hasBar = false;
    this.#tell(null);
  }

  #tell(task: TaskKind | null): void {
    for (const listener of this.#listeners) listener(task);
  }
}
