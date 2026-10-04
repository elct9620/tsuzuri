// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PipelineProgress } from "../backend/progress";
import { ProjectFeed } from "../backend/project";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import { pageContext } from "./context";
import { TaskRun } from "./task_run.svelte";
import TaskProgress from "./TaskProgress.svelte";
import { progressSteps } from "./test_task_progress";

describe("TaskProgress", () => {
  let run: TaskRun;
  let isCancelAsked: boolean;

  async function report(progress: Partial<PipelineProgress>): Promise<void> {
    window.dispatchEvent(
      new CustomEvent("rust:pipeline-progress", {
        detail: { percent: null, count: null, ...progress },
      }),
    );
    await tick();
  }

  async function begin(task: Parameters<TaskRun["begin"]>[0]): Promise<void> {
    run.begin(task);
    await tick();
  }

  const progressButton = () =>
    screen.queryByRole("button", { name: /轉錄|翻譯|準備/ });

  beforeEach(() => {
    document.body.innerHTML = NOTIFICATION_STACK;
    isCancelAsked = false;
    mockIPC((command) => {
      if (command === "cancel_task") isCancelAsked = true;
    });
    run = new TaskRun();
    render(TaskProgress, { context: pageContext(new ProjectFeed(), run) });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TX-007
  it("shows the Phase and its percentage in the editor", async () => {
    await begin("transcription");

    await report({ phase: "transcribe", percent: 42 });

    expect(screen.getByText("轉錄 42%", { selector: "p" })).not.toBeNull();
  });

  // @behavior TX-010
  it("shows a Phase without a percentage as a bar with no value", async () => {
    await begin("transcription");

    await report({ phase: "load", percent: null });

    expect(
      screen.getByRole("progressbar", { hidden: true }).hasAttribute("value"),
    ).toBe(false);
  });

  // @behavior TX-028
  it("sums up the running Phase in the heading's progress button", async () => {
    await begin("transcription");

    await report({ phase: "transcribe", percent: 23 });

    expect(progressButton()?.textContent?.trim()).toBe("轉錄 23%");
  });

  // @behavior TX-027
  it("lists the Phases of a transcription, marking the ones reached", async () => {
    await begin("transcription");

    await report({ phase: "load", percent: null });

    expect(progressSteps()).toEqual([
      "✓準備元件",
      "✓轉檔",
      "◌載入模型",
      "○轉錄",
    ]);
  });

  // @behavior TL-065
  it("shows how many Segments are translated beside the percentage", async () => {
    await begin("translation");

    await report({
      phase: "translate",
      percent: 63,
      count: { done_count: 132, total: 210 },
    });

    expect(
      screen.getByText("翻譯 63%，132 / 210", { selector: "p" }),
    ).not.toBeNull();
  });

  // @behavior TX-025
  it("clears the progress once the transcription ends", async () => {
    await begin("transcription");

    run.finish();
    await tick();

    expect(progressButton()).toBeNull();
  });

  // @behavior TX-029
  it("cancels a transcription from its progress", async () => {
    await begin("transcription");

    screen.getByRole("button", { hidden: true, name: "取消任務" }).click();
    run.fail({ code: "mode-cancelled" });
    await tick();

    expect([isCancelAsked, notifications()]).toEqual([true, ["已取消轉錄"]]);
  });

  it("shows no Phase reported while no task runs", async () => {
    await report({ phase: "transcribe", percent: 42 });

    expect(progressButton()).toBeNull();
  });

  it("tells the page of each task as it begins and once the run ends", () => {
    const tasks: unknown[] = [];
    document.body.addEventListener("progress:task", (event) =>
      tasks.push((event as CustomEvent).detail.task),
    );

    run.begin("transcription");
    run.begin("translation");
    run.finish();

    expect(tasks).toEqual(["transcription", "translation", null]);
  });
});
