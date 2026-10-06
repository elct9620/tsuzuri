// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import type { PipelineProgress } from "#/ipc/progress.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { showNotifications, notifications } from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import { TaskRun } from "#/state/task-run.svelte.ts";
import TaskProgress from "#/components/TaskProgress.svelte";
import { progressSteps } from "#/testing/task-progress.ts";

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
    showNotifications();
    isCancelAsked = false;
    mockIPC((command) => {
      if (command === "cancel_task") isCancelAsked = true;
    });
    run = new TaskRun();
    render(TaskProgress, {
      context: pageContext(
        new ProjectFeed(),
        new EditingSession(editingPort),
        run,
      ),
    });
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
});
