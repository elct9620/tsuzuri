// @vitest-environment happy-dom
import { screen, within } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { projectOf, resourceOf } from "#/testing/project.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import { pageContext } from "#/state/context.ts";
import { ResourceDock } from "#/state/resource-dock.svelte.ts";
import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
import ResourceList from "#/components/ResourceList.svelte";
import {
  notificationDetail,
  notifications,
  showNotifications,
} from "#/testing/notifications.ts";
import { usePlatform } from "#/testing/platform.ts";
import { settle } from "#/testing/settle.ts";

describe("ResourceList", () => {
  let feed: ProjectFeed;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let selectFailure: unknown;
  let reloadProject: () => unknown;
  let unfollow: () => void;
  let placeholders: ResourcePlaceholders;

  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const resourceList = () => screen.getByRole("list", { name: "資源" });
  const resourceButton = (name: string) =>
    within(resourceList()).getByRole("button", { name: new RegExp(name) });

  /** Draws the list with `next` as the Project open. */
  async function show(next: ProjectView): Promise<void> {
    project = next;
    renderFollowingProject(ResourceList, feed, {
      props: {
        dock: new ResourceDock(),
        openGlossary: () => {},
        placeholders,
      },
      context: pageContext(feed, new EditingSession(editingPort)),
    });
    await emit("project-changed");
    await settle();
  }

  async function choose(name: string): Promise<void> {
    resourceButton(name).click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    placeholders = new ResourcePlaceholders();
    calls = [];
    selectFailure = undefined;
    reloadProject = () => null;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "select_resource" && selectFailure !== undefined)
          return Promise.reject(selectFailure);
        if (command === "reload_project") return reloadProject();
      },
      { shouldMockEvents: true },
    );
    feed = new ProjectFeed();
    unfollow = await feed.start();
  });

  afterEach(() => {
    unfollow();
    clearMocks();
  });

  // @behavior PJ-034
  it("lists each Resource with its translations and whether it has a subtitle", async () => {
    await show(
      projectOf({
        resources: [
          resourceOf({ has_media: true, translation_languages: ["en"] }),
          resourceOf({ name: "ep02", has_media: true, has_subtitle: false }),
        ],
      }),
    );

    const items = within(resourceList())
      .getAllByRole("button")
      .map((button) => ({
        name: button.dataset.tooltip,
        badges: [...button.querySelectorAll(".badge")].map(
          (badge) => badge.textContent,
        ),
        hasNoSubtitle: button.querySelector(".status") !== null,
        isCurrent: button.classList.contains("menu-active"),
      }));
    expect(items).toEqual([
      { name: "ep01", badges: ["en"], hasNoSubtitle: false, isCurrent: true },
      { name: "ep02", badges: [], hasNoSubtitle: true, isCurrent: false },
    ]);
  });

  // @behavior PJ-117
  it("marks a Resource of subtitles alone", async () => {
    await show(
      projectOf({
        resources: [
          resourceOf({ has_media: true }),
          resourceOf({ name: "notes", has_media: false }),
        ],
      }),
    );

    const markedNames = within(resourceList())
      .getAllByText("字幕")
      .map((badge) => badge.closest("button")?.dataset.tooltip);
    expect(markedNames).toEqual(["notes"]);
  });

  // @behavior PJ-038
  it("names a Resource in full in its tooltip", async () => {
    await show(
      projectOf({
        resources: [resourceOf({ name: "[SHANA]C0220260514.zh-TW.mix" })],
      }),
    );

    expect(within(resourceList()).getByRole("button").dataset.tooltip).toBe(
      "[SHANA]C0220260514.zh-TW.mix",
    );
  });

  // @behavior GL-006
  it("offers to create a Translation Glossary when the Project has none", async () => {
    await show(projectOf({ translation_glossary: null }));

    expect(screen.queryByRole("button", { name: "建立詞彙表" })).not.toBeNull();
  });

  // @behavior PJ-035
  it("selects the Resource clicked in the list", async () => {
    await show(
      projectOf({ resources: [resourceOf(), resourceOf({ name: "ep02" })] }),
    );

    await choose("ep02");

    expect(sent("select_resource")).toEqual({ name: "ep02" });
  });

  // @behavior PJ-191
  it("says why a Resource was not selected", async () => {
    showNotifications();
    await show(
      projectOf({ resources: [resourceOf(), resourceOf({ name: "ep02" })] }),
    );
    selectFailure = { code: "malformed-srt", cue: 2 };

    await choose("ep02");

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["沒有切換資源"],
      expect.stringContaining("SRT 第 2 段無法讀取"),
    ]);
  });

  // @behavior ED-011
  it("reads the Project again when a Resource cannot be selected", async () => {
    await show(
      projectOf({ resources: [resourceOf(), resourceOf({ name: "ep02" })] }),
    );
    selectFailure = { code: "malformed-srt", cue: 2 };
    const currentProjectReads = calls.filter(
      (call) => call.command === "current_project",
    ).length;

    await choose("ep02");

    expect(
      calls.filter((call) => call.command === "current_project").length,
    ).toBeGreaterThan(currentProjectReads);
  });

  // @behavior ED-010
  it("tells the editor a Resource is being read once one is selected", async () => {
    await show(
      projectOf({ resources: [resourceOf(), resourceOf({ name: "ep02" })] }),
    );

    await choose("ep02");

    expect(placeholders.isShown).toBe(true);
  });

  // @behavior PJ-116
  it("reloads the Project from the button above the Resource list or its shortcut", async () => {
    await show(projectOf());

    screen.getByRole("button", { name: "重新載入" }).click();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    await settle();

    expect(
      calls.filter((call) => call.command === "reload_project").length,
    ).toBe(2);
  });

  // @behavior PJ-116
  it("reloads the Project with ⌘R on macOS", async () => {
    usePlatform("macos");
    await show(projectOf());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", metaKey: true }),
    );
    await settle();

    expect(sent("reload_project")).not.toBeUndefined();
  });

  // @behavior PJ-120
  it("leaves the field being typed in before reloading", async () => {
    await show(projectOf());
    const field = document.createElement("div");
    field.tabIndex = 0;
    document.body.append(field);
    const order: string[] = [];
    field.addEventListener("blur", () => order.push("leave"));
    field.focus();
    reloadProject = () => order.push("reload");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    await settle();
    field.remove();

    expect(order).toEqual(["leave", "reload"]);
  });

  it("reloads nothing without a Project", async () => {
    renderFollowingProject(ResourceList, feed, {
      props: {
        dock: new ResourceDock(),
        openGlossary: () => {},
        placeholders: new ResourcePlaceholders(),
      },
      context: pageContext(feed, new EditingSession(editingPort)),
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    await settle();

    expect(sent("reload_project")).toBeUndefined();
  });
});
