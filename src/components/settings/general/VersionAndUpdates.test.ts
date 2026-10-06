// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import type { AppUpdate } from "#/ipc/updates.ts";
import { EditingSession } from "#/editor/index.ts";
import {
  showNotifications,
  notificationAction,
  notificationDetail,
  notifications,
} from "#/components/test-notifications.ts";
import { pageContext } from "#/components/context.ts";
import UpdatesDialog from "#/components/UpdatesDialog.svelte";
import VersionAndUpdates from "#/components/settings/general/VersionAndUpdates.svelte";

describe("VersionAndUpdates", () => {
  let build: Record<string, unknown>;
  let calls: { command: string; args: unknown }[];
  /** What the releases hold; `unreachable` when they cannot be read. */
  let releases: AppUpdate | null | "unreachable";
  let updateAtLaunch: AppUpdate | null;
  let hasLaunchCheck: boolean;
  let channel: "stable" | "preview";
  /** The stable release a Rollback finds. */
  let stableRelease: AppUpdate | null;
  /** What installing answers: a refusal to throw, or never answering, as Tsuzuri restarts. */
  let installRefusal: { code: string } | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const shownBuild = () => screen.getByText(/（[0-9a-f]{7}）$/).textContent;

  const argsByCommand = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);
  const button = (name: string) => screen.queryByRole("button", { name });
  /** What the settings say the last check found. */
  const status = () =>
    button("檢查更新")!.parentElement!.querySelector("span:not(.loading)")!
      .textContent;
  const installWindow = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  const progressBar = () =>
    within(installWindow()).getByRole<HTMLProgressElement>("progressbar", {
      hidden: true,
    });

  /**
   * Opens Tsuzuri: the settings read the App Build and run the launch check as they are written,
   * beside the window an App Update installs behind.
   */
  async function openSettings(): Promise<void> {
    const context = pageContext(
      new ProjectFeed(),
      new EditingSession(editingPort),
    );
    render(VersionAndUpdates, { context });
    render(UpdatesDialog, { context });
    await settle();
    await settle();
  }

  async function press(name: string): Promise<void> {
    button(name)!.click();
    await settle();
    await settle();
  }

  async function copyBuild(): Promise<void> {
    screen.getByRole("button", { name: "複製" }).click();
    await settle();
    await settle();
  }

  beforeEach(async () => {
    build = {
      release_number: "0.1.0",
      release_name: "v0.1.0",
      is_preview_build: false,
      has_preview_channel: true,
      commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    };
    calls = [];
    releases = null;
    updateAtLaunch = null;
    hasLaunchCheck = true;
    channel = "stable";
    stableRelease = null;
    installRefusal = null;
    showNotifications();
    mockIPC((command, args) => {
      calls.push({ command, args });
      const settings = () => ({ has_launch_check: hasLaunchCheck, channel });
      if (command === "app_build") return build;
      if (command === "update_settings") return settings();
      if (command === "choose_launch_check") {
        hasLaunchCheck = (args as { hasLaunchCheck: boolean }).hasLaunchCheck;
        return settings();
      }
      if (command === "choose_update_channel") {
        channel = (args as { channel: "stable" | "preview" }).channel;
        return settings();
      }
      if (command === "check_for_rollback") return stableRelease;
      if (command === "check_for_update_at_launch") return updateAtLaunch;
      if (command === "check_for_update") {
        if (releases === "unreachable")
          throw { code: "update-failed", detail: "error sending request" };
        return releases;
      }
      if (command === "install_update") {
        if (installRefusal) throw installRefusal;
        return new Promise(() => {});
      }
    });
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior OB-014
  it("shows the Release Name and the short commit in the settings", async () => {
    await openSettings();

    expect(shownBuild()).toBe("v0.1.0（a1b2c3d）");
  });

  // @behavior OB-015
  it("copies the App Build for a report", async () => {
    await openSettings();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyBuild();

    expect([writeText.mock.calls, notifications()]).toEqual([
      [["Tsuzuri v0.1.0 (a1b2c3d)"]],
      ["已複製版本資訊"],
    ]);
  });

  // @behavior UP-031
  it("names a Preview build by its Release Name, never its release number", async () => {
    build = {
      ...build,
      release_number: "0.2.1-preview.202609281430+12",
      release_name: "Build 20260928+12",
      is_preview_build: true,
    };
    await openSettings();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyBuild();

    expect([shownBuild(), writeText.mock.calls]).toEqual([
      "Build 20260928+12（a1b2c3d）",
      [["Tsuzuri Build 20260928+12 (a1b2c3d)"]],
    ]);
  });

  // @behavior UP-012
  it("offers an App Update the launch check found", async () => {
    updateAtLaunch = STABLE_RELEASE;

    await openSettings();

    expect([notifications(), notificationAction(0)?.textContent]).toEqual([
      ["有新版本 v0.2.0"],
      "更新",
    ]);
  });

  // @behavior UP-019
  it("says nothing at launch when the launch check finds nothing", async () => {
    await openSettings();

    expect([notifications(), status()]).toEqual([[], ""]);
  });

  // @behavior UP-013
  it("says the running release is the latest when asked", async () => {
    await openSettings();

    await press("檢查更新");

    expect([status(), button("更新")]).toEqual(["已是最新版", null]);
  });

  // @behavior UP-014
  it("offers an App Update found when asked", async () => {
    releases = STABLE_RELEASE;
    await openSettings();

    await press("檢查更新");

    expect([status(), button("更新") !== null]).toEqual([
      "有新版本 v0.2.0",
      true,
    ]);
  });

  // @behavior UP-015
  it("tells of a check asked for that failed", async () => {
    releases = "unreachable";
    await openSettings();

    await press("檢查更新");

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["沒有檢查更新"],
      "更新失敗（error sending request）",
    ]);
  });

  // @behavior UP-016
  it("shows the percentage downloaded in a window that stays open", async () => {
    updateAtLaunch = STABLE_RELEASE;
    await openSettings();
    await settle();
    notificationAction(0)!.click();
    await settle();

    window.dispatchEvent(
      new CustomEvent("rust:update-progress", {
        detail: { downloaded: 45, total: 100 },
      }),
    );
    await settle();
    const escape = new Event("cancel", { cancelable: true });
    installWindow().dispatchEvent(escape);

    expect([
      argsByCommand("install_update").length,
      installWindow().open,
      screen.getByRole("heading", { hidden: true }).textContent,
      screen.getByText(/^下載中/).textContent,
      progressBar().value,
      escape.defaultPrevented,
    ]).toEqual([1, true, "正在更新到 v0.2.0", "下載中 45%", 45, true]);
  });

  // @behavior UP-020
  it("shows how much has downloaded when the size is unknown", async () => {
    releases = STABLE_RELEASE;
    await openSettings();
    await press("檢查更新");
    await press("更新");

    window.dispatchEvent(
      new CustomEvent("rust:update-progress", {
        detail: { downloaded: 3 * 1024 * 1024, total: null },
      }),
    );
    await settle();

    expect([
      screen.getByText(/^已下載/).textContent,
      progressBar().hasAttribute("value"),
    ]).toEqual(["已下載 3 MB", false]);
  });

  // @behavior UP-017
  it("closes the install window when installing is refused", async () => {
    releases = STABLE_RELEASE;
    installRefusal = { code: "update-during-mode" };
    await openSettings();
    await press("檢查更新");

    await press("更新");

    expect([
      installWindow().open,
      notifications(),
      notificationDetail(0),
    ]).toEqual([false, ["沒有安裝更新"], "任務執行中無法更新，請等任務結束"]);
  });

  // @behavior UP-018
  it("turns the launch check off in the settings", async () => {
    await openSettings();
    const toggle = screen.getByRole<HTMLInputElement>("checkbox");

    toggle.click();
    await settle();
    await settle();

    expect([argsByCommand("choose_launch_check"), toggle.checked]).toEqual([
      [{ hasLaunchCheck: false }],
      false,
    ]);
  });

  // @behavior UP-027
  it("chooses the Preview channel in the settings", async () => {
    await openSettings();
    const select = screen.getByRole<HTMLSelectElement>("combobox");

    select.value = "preview";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await settle();

    expect([argsByCommand("choose_update_channel"), select.value]).toEqual([
      [{ channel: "preview" }],
      "preview",
    ]);
  });

  // @behavior UP-028
  it.each([
    [true, "stable", true],
    [true, "preview", false],
    [false, "stable", false],
  ] as const)(
    "offers a Rollback only to a Preview build on Stable (preview build %s, %s channel)",
    async (isPreviewBuild, chosenChannel, isOffered) => {
      build = { ...build, is_preview_build: isPreviewBuild };
      channel = chosenChannel;

      await openSettings();

      expect(button("立即退回穩定版") !== null).toBe(isOffered);
    },
  );

  // @behavior UP-029
  it("rolls a Preview build back to the stable release", async () => {
    build = { ...build, is_preview_build: true };
    stableRelease = STABLE_RELEASE;
    await openSettings();

    await press("立即退回穩定版");

    expect([
      argsByCommand("check_for_rollback").length,
      argsByCommand("install_update").length,
      screen.getByRole("heading", { hidden: true }).textContent,
    ]).toEqual([1, 1, "正在更新到 v0.2.0"]);
  });

  // @behavior UP-032
  it("offers a Preview build by its Release Name", async () => {
    updateAtLaunch = PREVIEW_BUILD;

    await openSettings();

    expect(notifications()).toEqual(["有新的預覽版（Build 20260928+12）"]);
  });

  // @behavior UP-033
  it("hides the Update Channel from an rpm install", async () => {
    build = { ...build, has_preview_channel: false };

    await openSettings();

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

/** A stable release found as an App Update. */
const STABLE_RELEASE: AppUpdate = {
  release_number: "0.2.0",
  release_name: "v0.2.0",
  is_preview_build: false,
};

/** A Preview build found as an App Update. */
const PREVIEW_BUILD: AppUpdate = {
  release_number: "0.2.1-preview.202609281430+12",
  release_name: "Build 20260928+12",
  is_preview_build: true,
};
