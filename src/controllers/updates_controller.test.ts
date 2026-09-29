// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import NotificationController from "./notification_controller";
import UpdatesController from "./updates_controller";
import type { AppUpdate } from "../backend/updates";
import {
  NOTIFICATION_STACK,
  notificationAction,
  notificationDetail,
  notifications,
} from "../ui/test_notification";

describe("UpdatesController", () => {
  let application: Application;
  let calls: { command: string; args: unknown }[];
  /** What the releases hold; `unreachable` when they cannot be read. */
  let releases: AppUpdate | null | "unreachable";
  let updateAtLaunch: AppUpdate | null;
  let hasLaunchCheck: boolean;
  let channel: "stable" | "preview";
  let isPreviewBuild: boolean;
  let hasPreviewChannel: boolean;
  /** The stable release a Rollback finds. */
  let stableRelease: AppUpdate | null;
  /** What installing answers: a refusal to throw, or never answering, as Tsuzuri restarts. */
  let installRefusal: { code: string } | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-updates-target="${name}"]`)!;
  const argsByCommand = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);

  /** Opens Tsuzuri, where the updates controller runs the launch check as it connects. */
  async function launch(): Promise<void> {
    application = Application.start();
    application.register("notification", NotificationController);
    application.register("updates", UpdatesController);
    await settle();
    await settle();
  }

  async function press(action: string): Promise<void> {
    document
      .querySelector<HTMLButtonElement>(`[data-action="updates#${action}"]`)!
      .click();
    await settle();
    await settle();
  }

  beforeEach(() => {
    calls = [];
    releases = null;
    updateAtLaunch = null;
    hasLaunchCheck = true;
    channel = "stable";
    isPreviewBuild = false;
    hasPreviewChannel = true;
    stableRelease = null;
    installRefusal = null;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <div data-controller="updates" data-action="rust:update-progress@window->updates#showProgress">
        <button data-updates-target="checkButton" data-action="updates#check">檢查更新</button>
        <span data-updates-target="checkingSpinner" hidden></span>
        <span data-updates-target="status"></span>
        <button data-updates-target="updateButton" data-action="updates#install" hidden>更新</button>
        <input type="checkbox" data-updates-target="launchCheckToggle" data-action="change->updates#chooseLaunchCheck" />
        <div data-updates-target="channelRow">
          <select data-updates-target="channelSelect" data-action="change->updates#chooseChannel">
            <option value="stable">穩定版</option>
            <option value="preview">預覽版</option>
          </select>
          <button data-updates-target="rollbackButton" data-action="updates#rollBack" hidden>立即退回穩定版</button>
        </div>
        <dialog data-updates-target="dialog" data-action="cancel->updates#refuseClose">
          <h3 data-updates-target="dialogTitle"></h3>
          <p data-updates-target="progressText"></p>
          <progress max="100" data-updates-target="progressBar"></progress>
        </dialog>
      </div>
    `;
    mockIPC((command, args) => {
      calls.push({ command, args });
      const settings = () => ({ has_launch_check: hasLaunchCheck, channel });
      if (command === "app_build")
        return {
          release_number: isPreviewBuild
            ? "0.2.1-preview.202609281430+12"
            : "0.2.0",
          release_name: isPreviewBuild ? "Build 20260928+12" : "v0.2.0",
          is_preview_build: isPreviewBuild,
          has_preview_channel: hasPreviewChannel,
          commit: "a1b2c3d",
        };
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
    application.stop();
    clearMocks();
  });

  // @behavior UP-012
  it("offers an App Update the launch check found", async () => {
    updateAtLaunch = STABLE_RELEASE;

    await launch();

    expect([notifications(), notificationAction(0)?.textContent]).toEqual([
      ["有新版本 v0.2.0"],
      "更新",
    ]);
  });

  // @behavior UP-019
  it("says nothing at launch when the launch check finds nothing", async () => {
    await launch();

    expect([notifications(), target("status").textContent]).toEqual([[], ""]);
  });

  // @behavior UP-013
  it("says the running release is the latest when asked", async () => {
    await launch();

    await press("check");

    expect([
      target("status").textContent,
      target("updateButton").hidden,
    ]).toEqual(["已是最新版", true]);
  });

  // @behavior UP-014
  it("offers an App Update found when asked", async () => {
    releases = STABLE_RELEASE;
    await launch();

    await press("check");

    expect([
      target("status").textContent,
      target("updateButton").hidden,
    ]).toEqual(["有新版本 v0.2.0", false]);
  });

  // @behavior UP-015
  it("tells of a check asked for that failed", async () => {
    releases = "unreachable";
    await launch();

    await press("check");

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["沒有檢查更新"],
      "更新失敗（error sending request）",
    ]);
  });

  // @behavior UP-016
  it("shows the percentage downloaded in a window that stays open", async () => {
    updateAtLaunch = STABLE_RELEASE;
    await launch();
    notificationAction(0)!.click();
    await settle();

    window.dispatchEvent(
      new CustomEvent("rust:update-progress", {
        detail: { downloaded: 45, total: 100 },
      }),
    );
    const escape = new Event("cancel", { cancelable: true });
    target("dialog").dispatchEvent(escape);

    expect([
      argsByCommand("install_update").length,
      target<HTMLDialogElement>("dialog").open,
      target("dialogTitle").textContent,
      target("progressText").textContent,
      target<HTMLProgressElement>("progressBar").value,
      escape.defaultPrevented,
    ]).toEqual([1, true, "正在更新到 v0.2.0", "下載中 45%", 45, true]);
  });

  // @behavior UP-020
  it("shows how much has downloaded when the size is unknown", async () => {
    releases = STABLE_RELEASE;
    await launch();
    await press("check");
    await press("install");

    window.dispatchEvent(
      new CustomEvent("rust:update-progress", {
        detail: { downloaded: 3 * 1024 * 1024, total: null },
      }),
    );

    expect([
      target("progressText").textContent,
      target("progressBar").hasAttribute("value"),
    ]).toEqual(["已下載 3 MB", false]);
  });

  // @behavior UP-017
  it("closes the install window when installing is refused", async () => {
    releases = STABLE_RELEASE;
    installRefusal = { code: "update-during-mode" };
    await launch();
    await press("check");

    await press("install");

    expect([
      target<HTMLDialogElement>("dialog").open,
      notifications(),
      notificationDetail(0),
    ]).toEqual([false, ["沒有安裝更新"], "任務執行中無法更新，請等任務結束"]);
  });

  // @behavior UP-018
  it("turns the launch check off in the settings", async () => {
    await launch();
    const toggle = target<HTMLInputElement>("launchCheckToggle");

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
    await launch();
    const select = target<HTMLSelectElement>("channelSelect");

    select.value = "preview";
    select.dispatchEvent(new Event("change"));
    await settle();
    await settle();

    expect([argsByCommand("choose_update_channel"), select.value]).toEqual([
      [{ channel: "preview" }],
      "preview",
    ]);
  });

  // @behavior UP-028
  it.each([
    [true, "stable", false],
    [true, "preview", true],
    [false, "stable", true],
  ] as const)(
    "offers a Rollback only to a Preview build on Stable (preview build %s, %s channel)",
    async (previewBuild, chosenChannel, isHidden) => {
      isPreviewBuild = previewBuild;
      channel = chosenChannel;

      await launch();

      expect(target("rollbackButton").hidden).toBe(isHidden);
    },
  );

  // @behavior UP-029
  it("rolls a Preview build back to the stable release", async () => {
    isPreviewBuild = true;
    stableRelease = STABLE_RELEASE;
    await launch();

    await press("rollBack");

    expect([
      argsByCommand("check_for_rollback").length,
      argsByCommand("install_update").length,
      target("dialogTitle").textContent,
    ]).toEqual([1, 1, "正在更新到 v0.2.0"]);
  });

  // @behavior UP-032
  it("offers a Preview build by its Release Name", async () => {
    updateAtLaunch = PREVIEW_BUILD;

    await launch();

    expect(notifications()).toEqual(["有新的預覽版（Build 20260928+12）"]);
  });

  // @behavior UP-033
  it("hides the Update Channel from an rpm install", async () => {
    hasPreviewChannel = false;

    await launch();

    expect(target("channelRow").hidden).toBe(true);
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
