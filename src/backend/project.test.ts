// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectOf } from "../test_project";
import { ProjectFeed, type ProjectView } from "./project";

describe("ProjectFeed", () => {
  beforeEach(() => {
    mockIPC((command) => (command === "current_project" ? projectOf() : null), {
      shouldMockEvents: true,
    });
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior PJ-184
  it("shows the Project to every view when one of them fails", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const feed = new ProjectFeed();
    const failure = new Error("the Preview could not load its media");
    const shown: (ProjectView | null)[] = [];
    feed.follow(() => {
      throw failure;
    });
    feed.follow((project) => shown.push(project));

    const unlisten = await feed.start();
    unlisten();

    expect([shown, reported.mock.calls]).toEqual([[projectOf()], [[failure]]]);
  });
});
