// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import type { ScannedScript } from "#/ipc/scripts.ts";
import { EditingSession } from "#/editor/index.ts";
import { projectOf } from "#/testing/project.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import { pageContext } from "#/state/context.ts";
import { TaskRun } from "#/state/task-run.svelte.ts";
import MacroMenu from "#/components/MacroMenu.svelte";
import { settle } from "#/testing/settle.ts";

describe("MacroMenu", () => {
  let feed: ProjectFeed;
  let session: EditingSession;
  let run: TaskRun;
  let scripts: ScannedScript[];
  let calls: { command: string; args: unknown }[];
  let unfollow: () => void;

  const project: ProjectView = projectOf({
    segments: [
      { start_ms: 0, end_ms: 1000, text: "你好" },
      { start_ms: 1000, end_ms: 2000, text: "世界" },
    ],
  });
  const interview: ScannedScript = {
    name: "interview.rb",
    registrations: [
      { kind: "macro", id: "merge_runs", label: "合併連續發言" },
      { kind: "export-format", id: "tsv", label: "TSV", extension: "tsv" },
    ],
    failure: null,
  };

  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const macrosButton = () =>
    screen.queryByRole("button", { hidden: true, name: "巨集" });

  async function show(): Promise<void> {
    renderFollowingProject(MacroMenu, feed, {
      context: pageContext(feed, session, run),
    });
    await emit("project-changed");
    await settle();
  }

  beforeEach(async () => {
    scripts = [interview];
    calls = [];
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "scan_scripts") return scripts;
        if (command === "run_macro") return null;
      },
      { shouldMockEvents: true },
    );
    feed = new ProjectFeed();
    session = new EditingSession(editingPort);
    run = new TaskRun();
    unfollow = await feed.start();
  });

  afterEach(() => {
    unfollow();
    clearMocks();
  });

  // @behavior SR-033
  it("lists each Macro by its label beside the Script it is in", async () => {
    await show();

    const item = screen.getByRole("button", {
      hidden: true,
      name: /合併連續發言/,
    });

    expect(item.textContent).toBe("合併連續發言interview.rb");
  });

  // @behavior SR-034
  it("stays out of the way while no Script registers a Macro", async () => {
    scripts = [{ ...interview, registrations: [interview.registrations[1]] }];

    await show();

    expect(macrosButton()).toBeNull();
  });

  // @behavior SR-035
  it("runs a Macro with the Checked Segments, then unchecks them", async () => {
    await show();
    session.check(1, true);

    screen.getByRole("button", { hidden: true, name: /合併連續發言/ }).click();
    await settle();

    expect([sent("run_macro"), session.checkedIndexes]).toEqual([
      { script: "interview.rb", id: "merge_runs", checkedSegments: [1] },
      [],
    ]);
  });

  it("names a running Macro by its label on the task's badge", async () => {
    run.begin("script", "合併連續發言");

    run.show({ phase: "script", percent: null });

    expect(run.summary).toBe("合併連續發言 · 執行腳本");
  });

  it("reads the Scripts again as the menu opens", async () => {
    await show();
    scripts = [];

    macrosButton()!.focus();
    await settle();

    expect(
      calls.filter(({ command }) => command === "scan_scripts"),
    ).toHaveLength(2);
  });
});
