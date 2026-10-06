// @vitest-environment happy-dom
import { screen, within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type RecentProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import { notificationStack } from "#/state/notification.svelte.ts";
import { drawPage } from "#/page.ts";
import { mockPageMount } from "#/testing/page.ts";
import { notificationDetail, notifications } from "#/testing/notifications.ts";
import { settle } from "#/testing/settle.ts";

const LECTURE: RecentProjectView = {
  directory: "/videos/lecture",
  name: "lecture",
  opened_at_ms: Date.UTC(2026, 8, 24, 12),
};

describe("StartScreen", () => {
  let recent: RecentProjectView[];
  let sent: Record<string, unknown>;
  let openProject: () => unknown;
  let openSrt: () => unknown;
  let page: Record<string, unknown>;
  let unfollow: () => void;

  const recentList = () =>
    screen.queryByRole("list", { name: t("start.recentProjects") });
  const rowButtons = () => within(recentList()!).getAllByRole("button");
  const startScreen = () =>
    within(screen.getByRole("region", { name: "Tsuzuri" }));

  async function click(name: string): Promise<void> {
    startScreen()
      .getByRole("button", { name: t(name) })
      .click();
    await settle();
  }

  /** Makes opening a Recent Project fail as Rust drops one whose directory is gone. */
  function loseRecentDirectory(): void {
    openProject = () => {
      recent = [];
      return Promise.reject({
        code: "directory-not-found",
        directory: "/videos/lecture",
      });
    };
  }

  /**
   * Draws the page with no Project open, as the app starts, and clears the Notifications its other
   * Svelte Components show for the reads this test leaves unanswered.
   */
  async function showStartScreen(): Promise<void> {
    const feed = new ProjectFeed();
    page = drawPage(feed, new EditingSession(editingPort));
    unfollow = await feed.start();
    await settle();
    notificationStack.clear();
  }

  beforeEach(() => {
    recent = [LECTURE];
    sent = {};
    openProject = () => null;
    openSrt = () => null;
    mockPageMount(null, {
      recent_projects: () => recent,
      "plugin:dialog|open": (args) =>
        (args as { options: { directory: boolean } }).options.directory
          ? "/talks"
          : "/subtitles/lecture.srt",
      open_project: (args) => {
        sent.open_project = args;
        return openProject();
      },
      open_srt: (args) => {
        sent.open_srt = args;
        return openSrt();
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

    expect(sent.open_project).toEqual({
      path: "/videos/lecture",
      language: "zh-TW",
    });
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
    loseRecentDirectory();
    await showStartScreen();

    rowButtons()[0].click();
    await settle();
    await settle();

    expect(recentList()).toBeNull();
  });

  // @behavior PJ-033
  it("opens the chosen directory as the Project", async () => {
    await showStartScreen();

    await click("toolbar.openDirectory");

    expect(sent.open_project).toEqual({ path: "/talks", language: "zh-TW" });
  });

  // @behavior PJ-007
  it("opens the chosen SRT file with the Interface Language", async () => {
    await showStartScreen();

    await click("toolbar.openSrt");

    expect(sent.open_srt).toEqual({
      path: "/subtitles/lecture.srt",
      language: "zh-TW",
    });
  });

  // @behavior PJ-008
  it("says which cue kept the SRT file from being opened", async () => {
    openSrt = () => Promise.reject({ code: "malformed-srt", cue: 2 });
    await showStartScreen();

    await click("toolbar.openSrt");

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["沒有開啟"],
      expect.stringContaining("SRT 第 2 段無法讀取"),
    ]);
  });

  // @behavior PJ-167
  it("warns that another Project cannot open while a task runs", async () => {
    openProject = () => Promise.reject({ code: "opening-during-mode" });
    await showStartScreen();

    await click("toolbar.openDirectory");

    expect([
      notificationDetail(0),
      document.querySelector<SVGElement>("[data-notifications] svg")!.dataset
        .kind,
    ]).toEqual(["任務執行中無法開啟其他專案，請等任務結束或先取消", "warning"]);
  });
});
