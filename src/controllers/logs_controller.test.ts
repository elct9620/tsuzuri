// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LogsController from "./logs_controller";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";

describe("LogsController", () => {
  let application: Application;
  let calls: { command: string; args: unknown }[];
  let chosenPath: string;
  let debugLogInUse: boolean;
  let hasDebugLogChosen: boolean;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = (name: string) =>
    document.querySelector<HTMLElement>(`[data-logs-target="${name}"]`)!;
  const argsByCommand = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);

  /** Opens the general settings, where the logs controller reads the log directory as it connects. */
  async function openSettings(): Promise<void> {
    application = Application.start();
    application.register("logs", LogsController);
    await settle();
  }

  async function chooseDirectory(): Promise<void> {
    document.querySelector<HTMLButtonElement>("#choose")!.click();
    await settle();
    await settle();
  }

  beforeEach(async () => {
    calls = [];
    chosenPath = "/os/logs";
    debugLogInUse = false;
    hasDebugLogChosen = false;
    failingCommand = null;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <fieldset data-controller="logs">
        <span data-logs-target="path"></span>
        <button id="choose" data-action="logs#choose">切換目錄</button>
        <button id="open" data-action="logs#openDirectory">開啟目錄</button>
        <div data-logs-target="pendingHint" hidden></div>
        <input type="checkbox" data-logs-target="debugLogToggle" data-action="change->logs#chooseDebugLog" />
        <div data-logs-target="debugLogPendingHint" hidden></div>
      </fieldset>
    `;
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === failingCommand)
        return Promise.reject({ code: "io", detail: "denied" });
      if (command === "log_directory")
        return { in_use: "/os/logs", next_launch: chosenPath };
      if (command === "plugin:dialog|open") return "/logs";
      if (command === "choose_debug_log")
        hasDebugLogChosen = (args as { hasDebugLog: boolean }).hasDebugLog;
      if (command === "debug_log" || command === "choose_debug_log")
        return {
          is_written_now: debugLogInUse,
          is_written_next_launch: hasDebugLogChosen,
        };
      if (command === "choose_log_directory") {
        chosenPath = (args as { path: string }).path;
        return { in_use: "/os/logs", next_launch: chosenPath };
      }
    });
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior OB-007
  it("chooses the log directory in the settings", async () => {
    await openSettings();

    await chooseDirectory();

    expect([
      argsByCommand("choose_log_directory"),
      target("pendingHint").hidden,
      target("path").textContent,
    ]).toEqual([[{ path: "/logs" }], false, "/os/logs"]);
  });

  // @behavior OB-010
  it("names the directory the log moves to after a restart", async () => {
    await openSettings();

    await chooseDirectory();

    expect(target("pendingHint").textContent).toBe("重新啟動後改寫到 /logs");
  });

  // @behavior OB-011
  it("says nothing of a restart while the chosen directory is in use", async () => {
    await openSettings();

    expect(target("pendingHint").hidden).toBe(true);
  });

  // @behavior OB-012
  it("tells on opening the settings of a directory waiting for a restart", async () => {
    chosenPath = "/logs";

    await openSettings();

    expect([
      target("pendingHint").hidden,
      target("pendingHint").textContent,
    ]).toEqual([false, "重新啟動後改寫到 /logs"]);
  });

  // @behavior OB-020
  it("turns the Debug Log on for the next launch", async () => {
    await openSettings();
    const toggle = target("debugLogToggle") as HTMLInputElement;

    toggle.click();
    await settle();
    await settle();

    expect([
      argsByCommand("choose_debug_log"),
      toggle.checked,
      target("debugLogPendingHint").hidden,
      target("debugLogPendingHint").textContent,
    ]).toEqual([
      [{ hasDebugLog: true }],
      true,
      false,
      "重新啟動後開始寫入除錯紀錄",
    ]);
  });

  // @behavior OB-021
  it("says nothing of a restart while the Debug Log is as chosen", async () => {
    debugLogInUse = true;
    hasDebugLogChosen = true;

    await openSettings();

    expect([
      (target("debugLogToggle") as HTMLInputElement).checked,
      target("debugLogPendingHint").hidden,
    ]).toEqual([true, true]);
  });

  // @behavior OB-008
  it("opens the log directory", async () => {
    await openSettings();
    document.querySelector<HTMLButtonElement>("#open")!.click();
    await settle();

    expect(argsByCommand("open_log_directory")).toHaveLength(1);
  });

  // @behavior OB-024
  it("says the log settings were not read", async () => {
    failingCommand = "log_directory";

    await openSettings();

    expect(notifications()).toEqual(["讀不到日誌目錄"]);
  });

  // @behavior OB-025
  it("says the log directory was not changed when recording it fails", async () => {
    failingCommand = "choose_log_directory";
    await openSettings();

    await chooseDirectory();

    expect(notifications()).toEqual(["沒有切換日誌目錄"]);
  });

  // @behavior OB-026
  it("says the Debug Log was not changed when recording it fails", async () => {
    failingCommand = "choose_debug_log";
    await openSettings();

    (target("debugLogToggle") as HTMLInputElement).click();
    await settle();

    expect(notifications()).toEqual(["沒有切換除錯紀錄"]);
  });

  // @behavior OB-027
  it("says the log directory was not opened when opening it fails", async () => {
    failingCommand = "open_log_directory";
    await openSettings();

    document.querySelector<HTMLButtonElement>("#open")!.click();
    await settle();

    expect(notifications()).toEqual(["沒有開啟日誌目錄"]);
  });
});
