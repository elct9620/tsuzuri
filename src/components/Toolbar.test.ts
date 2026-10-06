// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import {
  ProjectFeed,
  type ProjectView,
  type RecentProjectView,
} from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { drawPage } from "#/page.ts";
import { mockPageMount } from "#/test-page.ts";
import { projectOf } from "#/test-project.ts";

const LECTURE: RecentProjectView = {
  directory: "/videos/lecture",
  name: "lecture",
  opened_at_ms: Date.UTC(2026, 8, 24, 12),
};

describe("Toolbar", () => {
  let recent: RecentProjectView[];
  let project: ProjectView | null;
  let sentOptions: unknown;
  let page: Record<string, unknown>;
  let unfollow: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const nameField = () =>
    screen.getByRole<HTMLInputElement>("textbox", { name: "專案名稱" });

  /** Draws the page as the app starts; the toolbar stays drawn while no Project is open. */
  async function showPage(): Promise<void> {
    const feed = new ProjectFeed();
    page = drawPage(feed, new EditingSession(editingPort));
    unfollow = await feed.start();
    await settle();
  }

  beforeEach(() => {
    recent = [LECTURE];
    project = null;
    sentOptions = undefined;
    mockPageMount(null, {
      current_project: () => project,
      recent_projects: () => recent,
      set_project_options: (args) => (sentOptions = args),
    });
  });

  afterEach(() => {
    unfollow();
    unmount(page);
    clearMocks();
  });

  // @behavior PJ-164
  it("lists each Recent Project in the Open menu with its path as the tooltip", async () => {
    await showPage();

    const item = screen.getByRole("button", { hidden: true, name: "lecture" });
    expect(item.dataset.tooltip).toBe("/videos/lecture");
  });

  // @behavior PJ-179
  it("lists a Recent Project in the Open menu by its Project Name", async () => {
    recent = [{ ...LECTURE, name: "週會錄影" }];

    await showPage();

    expect(
      screen.queryByRole("button", { hidden: true, name: "週會錄影" }),
    ).not.toBeNull();
  });

  // @behavior PJ-175
  it("shows the Project Name in the toolbar and the window title", async () => {
    project = projectOf({ name: "週會錄影" });

    await showPage();

    expect([nameField().value, document.title]).toEqual([
      "週會錄影",
      "週會錄影 - Tsuzuri",
    ]);
  });

  // @behavior PJ-181
  it("sets the Project Name typed over the toolbar's", async () => {
    project = projectOf({ name: "lecture" });
    await showPage();

    nameField().value = "週會錄影";
    nameField().dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(sentOptions).toEqual({
      options: { ...projectOf().options, name: "週會錄影" },
    });
  });

  // @behavior PJ-182
  it("puts back the toolbar's Project Name when Esc is pressed", async () => {
    project = projectOf({
      name: "週會錄影",
      options: { ...projectOf().options, name: "週會錄影" },
    });
    await showPage();
    const name = nameField();
    name.focus();

    name.value = "lecture";
    name.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();

    expect([name.value, document.activeElement === name, sentOptions]).toEqual([
      "週會錄影",
      false,
      undefined,
    ]);
  });
});
