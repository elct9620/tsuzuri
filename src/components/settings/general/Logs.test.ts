// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Logs from "./Logs.svelte";
import { showNotifications, notifications } from "../../test_notifications";

describe("Logs", () => {
  let calls: { command: string; args: unknown }[];
  let chosenPath: string;
  let debugLogInUse: boolean;
  let hasDebugLogChosen: boolean;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const argsByCommand = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);
  const logs = () => screen.getByRole("group", { name: "日誌" });
  /** The text of each hint the log settings show. */
  const hints = () =>
    within(logs())
      .queryAllByRole("alert")
      .map((hint) => hint.textContent!.trim());
  const debugLogToggle = () =>
    within(
      screen.getByText("除錯紀錄").closest("li")!,
    ).getByRole<HTMLInputElement>("checkbox");

  /** Opens the general settings, which read the log settings as they are written. */
  async function openSettings(): Promise<void> {
    render(Logs);
    await settle();
  }

  async function chooseDirectory(): Promise<void> {
    screen.getByRole("button", { name: "切換目錄" }).click();
    await settle();
    await settle();
  }

  async function openDirectory(): Promise<void> {
    screen.getByRole("button", { name: "開啟目錄" }).click();
    await settle();
  }

  beforeEach(() => {
    calls = [];
    chosenPath = "/os/logs";
    debugLogInUse = false;
    hasDebugLogChosen = false;
    failingCommand = null;
    showNotifications();
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
    clearMocks();
  });

  // @behavior OB-007
  it("chooses the log directory in the settings", async () => {
    await openSettings();

    await chooseDirectory();

    expect([
      argsByCommand("choose_log_directory"),
      hints(),
      screen.getByTitle("/os/logs").textContent,
    ]).toEqual([[{ path: "/logs" }], ["重新啟動後改寫到 /logs"], "/os/logs"]);
  });

  // @behavior OB-010
  it("names the directory the log moves to after a restart", async () => {
    await openSettings();

    await chooseDirectory();

    expect(hints()).toEqual(["重新啟動後改寫到 /logs"]);
  });

  // @behavior OB-011
  it("says nothing of a restart while the chosen directory is in use", async () => {
    await openSettings();

    expect(hints()).toEqual([]);
  });

  // @behavior OB-012
  it("tells on opening the settings of a directory waiting for a restart", async () => {
    chosenPath = "/logs";

    await openSettings();

    expect(hints()).toEqual(["重新啟動後改寫到 /logs"]);
  });

  // @behavior OB-020
  it("turns the Debug Log on for the next launch", async () => {
    await openSettings();

    debugLogToggle().click();
    await settle();
    await settle();

    expect([
      argsByCommand("choose_debug_log"),
      debugLogToggle().checked,
      hints(),
    ]).toEqual([[{ hasDebugLog: true }], true, ["重新啟動後開始寫入除錯紀錄"]]);
  });

  // @behavior OB-021
  it("says nothing of a restart while the Debug Log is as chosen", async () => {
    debugLogInUse = true;
    hasDebugLogChosen = true;

    await openSettings();

    expect([debugLogToggle().checked, hints()]).toEqual([true, []]);
  });

  // @behavior OB-008
  it("opens the log directory", async () => {
    await openSettings();

    await openDirectory();

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

    debugLogToggle().click();
    await settle();

    expect(notifications()).toEqual(["沒有切換除錯紀錄"]);
  });

  // @behavior OB-027
  it("says the log directory was not opened when opening it fails", async () => {
    failingCommand = "open_log_directory";
    await openSettings();

    await openDirectory();

    expect(notifications()).toEqual(["沒有開啟日誌目錄"]);
  });
});
