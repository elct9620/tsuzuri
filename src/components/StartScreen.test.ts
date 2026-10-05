// @vitest-environment happy-dom
import { screen, within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "../backend/editing";
import { ProjectFeed, type RecentProjectView } from "../backend/project";
import { EditingSession } from "../editor";
import { t } from "../i18n";
import { drawPage } from "../page";
import { mockPageMount } from "../test-page";

const LECTURE: RecentProjectView = {
  directory: "/videos/lecture",
  name: "lecture",
  opened_at_ms: Date.UTC(2026, 8, 24, 12),
};

describe("StartScreen", () => {
  let recent: RecentProjectView[];
  let opened: unknown[];
  let page: Record<string, unknown>;
  let unfollow: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const recentList = () =>
    screen.queryByRole("list", { name: t("start.recentProjects") });
  const rowButtons = () => within(recentList()!).getAllByRole("button");

  /** Draws the page with no Project open, as the app starts. */
  async function showStartScreen(): Promise<void> {
    const feed = new ProjectFeed();
    page = drawPage(feed, new EditingSession(editingPort));
    unfollow = await feed.start();
    await settle();
  }

  beforeEach(() => {
    recent = [LECTURE];
    opened = [];
    mockPageMount(null, {
      recent_projects: () => recent,
      open_project: (args) => {
        opened.push(args);
        recent = [];
        return Promise.reject({
          code: "directory-not-found",
          directory: "/videos/lecture",
        });
      },
    });
  });

  afterEach(() => {
    unfollow();
    unmount(page);
    clearMocks();
  });

  // @behavior PJ-161
  it("lists each Recent Project with its name, path and the date it was opened", async () => {
    await showStartScreen();

    expect(
      rowButtons().map((button) =>
        button.parentElement!.textContent!.trim().split(/\s+/),
      ),
    ).toEqual([["lecture", "/videos/lecture", "2026年9月24日"]]);
  });

  // @behavior PJ-162
  it("opens the directory of the row clicked", async () => {
    await showStartScreen();

    rowButtons()[0].click();
    await settle();

    expect(opened).toEqual([{ path: "/videos/lecture", language: "zh-TW" }]);
  });

  // @behavior PJ-163
  it("hides the list and its heading while there are no Recent Projects", async () => {
    recent = [];

    await showStartScreen();

    expect(recentList()).toBeNull();
    expect(screen.queryByText(t("start.recentProjects"))).toBeNull();
  });

  // @behavior PJ-179
  it("lists a Recent Project by its Project Name", async () => {
    recent = [{ ...LECTURE, name: "週會錄影" }];

    await showStartScreen();

    expect(rowButtons()[0].firstElementChild!.textContent).toBe("週會錄影");
  });

  // @behavior PJ-165
  it("reads the Recent Projects again once one could not be opened", async () => {
    await showStartScreen();

    rowButtons()[0].click();
    await settle();
    await settle();

    expect(recentList()).toBeNull();
  });
});
