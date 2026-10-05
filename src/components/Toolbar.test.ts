// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "../backend/editing";
import { ProjectFeed, type RecentProjectView } from "../backend/project";
import { EditingSession } from "../editor";
import { drawPage } from "../page";
import { mockPageMount } from "../test-page";

const LECTURE: RecentProjectView = {
  directory: "/videos/lecture",
  name: "lecture",
  opened_at_ms: Date.UTC(2026, 8, 24, 12),
};

describe("Toolbar", () => {
  let recent: RecentProjectView[];
  let page: Record<string, unknown>;
  let unfollow: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Draws the page as the app starts; the toolbar stays drawn while no Project is open. */
  async function showPage(): Promise<void> {
    const feed = new ProjectFeed();
    page = drawPage(feed, new EditingSession(editingPort));
    unfollow = await feed.start();
    await settle();
  }

  beforeEach(() => {
    recent = [LECTURE];
    mockPageMount(null, { recent_projects: () => recent });
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
});
