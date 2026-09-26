// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LogsController from "./logs_controller";

describe("LogsController", () => {
  let application: Application;
  let calls: { command: string; args: unknown }[];
  let chosenPath: string;

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
    document.body.innerHTML = `
      <fieldset data-controller="logs">
        <span data-logs-target="path"></span>
        <button id="choose" data-action="logs#choose">切換目錄</button>
        <button id="open" data-action="logs#openDirectory">開啟目錄</button>
        <div data-logs-target="pendingHint" hidden></div>
      </fieldset>
    `;
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "log_directory")
        return { in_use: "/os/logs", chosen: chosenPath };
      if (command === "plugin:dialog|open") return "/logs";
      if (command === "choose_log_directory") {
        chosenPath = (args as { path: string }).path;
        return { in_use: "/os/logs", chosen: chosenPath };
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

  // @behavior OB-008
  it("opens the log directory", async () => {
    await openSettings();
    document.querySelector<HTMLButtonElement>("#open")!.click();
    await settle();

    expect(argsByCommand("open_log_directory")).toHaveLength(1);
  });
});
