// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test-project";
import {
  showNotifications,
  notificationDetail,
  notifications,
} from "../components/test-notifications";
import { composingOption } from "./field-controller";
import ProjectController from "./project-controller";

describe("ProjectController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let openSrt: () => unknown;
  let openProject: () => unknown;
  let reloadProject: () => unknown;
  let chosenFile: string;
  let requestedSrt: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-project-target="${name}"]`)!;

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  async function hold(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function click(selector: string): Promise<void> {
    document.querySelector<HTMLElement>(selector)!.click();
    await settle();
  }

  /** Starts the toolbar as the page does, relaying Rust events and reading the Project. */
  async function start(): Promise<void> {
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    await assemble(application, {
      project: ProjectController,
    }).start();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    requestedSrt = null;
    calls = [];
    openSrt = () => null;
    openProject = () => null;
    reloadProject = () => null;
    chosenFile = "/subtitles/lecture.srt";
    document.body.innerHTML = `
      <main
        data-controller="project"
        data-action="keydown.ctrl+r@window->project#reload:prevent keydown.meta+r@window->project#reload:prevent rust:changed-elsewhere-kept@window->project#notifyChangedElsewhereKept rust:srt-requested@window->project#openRequestedSrt"
      >
        <section data-project-target="startScreen"></section>
        <div data-project-target="workspace" hidden>
          <input data-project-target="name" data-action="change->project#rename keydown.enter->project#leaveName:!composing keydown.esc->project#discardName:!composing" />
          <div class="dropdown">
            <div tabindex="0" role="button">開啟</div>
            <button id="open-directory" data-action="project#openDirectory">開啟目錄</button>
            <button id="open-srt" data-action="project#openSrt">開啟 SRT</button>
          </div>
          <button id="reload" data-action="project#reload">重新載入</button>
        </div>
      </main>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "plugin:dialog|open")
          return (args as { options: { directory: boolean } }).options.directory
            ? "/talks"
            : chosenFile;
        if (command === "open_srt") return openSrt();
        if (command === "open_project") return openProject();
        if (command === "reload_project") return reloadProject();
        if (command === "take_requested_srt") {
          const takenSrt = requestedSrt;
          requestedSrt = null;
          return takenSrt;
        }
      },
      { shouldMockEvents: true },
    );
    await start();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior PJ-007
  it("opens the chosen SRT file with the Interface Language", async () => {
    await click("#open-srt");

    expect(sent("open_srt")).toEqual({
      path: "/subtitles/lecture.srt",
      language: "zh-TW",
    });
  });

  // @behavior PJ-008
  it("says which cue kept the SRT file from being opened", async () => {
    openSrt = () => {
      throw { code: "malformed-srt", cue: 2 };
    };

    showNotifications();

    await click("#open-srt");

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["沒有開啟"],
      expect.stringContaining("SRT 第 2 段無法讀取"),
    ]);
  });

  // @behavior PJ-167
  it("warns that another Project cannot open while a task runs", async () => {
    openProject = () => {
      throw { code: "opening-during-mode" };
    };

    showNotifications();

    await click("#open-directory");

    expect([
      notificationDetail(0),
      document.querySelector<SVGElement>("[data-notifications] svg")!.dataset
        .kind,
    ]).toEqual(["任務執行中無法開啟其他專案，請等任務結束或先取消", "warning"]);
  });

  // @behavior PJ-171
  it("opens the Requested SRT as the toolbar starts", async () => {
    application.stop();
    calls = [];
    requestedSrt = "/talks/ep02.srt";

    await start();

    expect(sent("open_srt")).toEqual({
      path: "/talks/ep02.srt",
      language: "zh-TW",
    });
  });

  // @behavior PJ-172
  it("opens an SRT file requested while the toolbar runs", async () => {
    await hold(projectOf({ directory: "/videos/lecture" }));
    requestedSrt = "/talks/ep02.srt";

    await emit("srt-requested");
    await settle();

    expect(sent("open_srt")).toEqual({
      path: "/talks/ep02.srt",
      language: "zh-TW",
    });
  });

  // @behavior PJ-033
  it("opens the chosen directory as the Project", async () => {
    await click("#open-directory");

    expect(sent("open_project")).toEqual({ path: "/talks", language: "zh-TW" });
  });

  // @behavior PJ-116
  it("reloads the Project from the button above the Resource list or its shortcut", async () => {
    await hold(projectOf());

    await click("#reload");
    for (const key of [{ ctrlKey: true }, { metaKey: true }])
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ...key }));
    await settle();

    expect(
      calls.filter((call) => call.command === "reload_project").length,
    ).toBe(3);
  });

  // @behavior PJ-120
  it("leaves the field being typed in before reloading", async () => {
    await hold(projectOf());
    const field = document.createElement("div");
    field.tabIndex = 0;
    const order: string[] = [];
    field.addEventListener("blur", () => order.push("leave"));
    target("workspace").append(field);
    field.focus();
    reloadProject = () => order.push("reload");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    await settle();

    expect(order).toEqual(["leave", "reload"]);
  });

  it("reloads nothing without a Project", async () => {
    await hold(null);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
    );
    await settle();

    expect(sent("reload_project")).toBeUndefined();
  });

  // @behavior PJ-036
  it("shows only the start screen without a Project", async () => {
    await hold(null);

    expect([
      target("startScreen").hidden,
      target("workspace").hidden,
      target("workspace").hidden,
    ]).toEqual([false, true, true]);
  });

  // @behavior PJ-175
  it("shows the Project Name in the toolbar and the window title", async () => {
    await hold(projectOf({ name: "週會錄影" }));

    expect([target<HTMLInputElement>("name").value, document.title]).toEqual([
      "週會錄影",
      "週會錄影 - Tsuzuri",
    ]);
  });

  // @behavior PJ-181
  it("sets the Project Name typed over the toolbar's", async () => {
    await hold(projectOf({ name: "lecture" }));
    const name = target<HTMLInputElement>("name");

    name.value = "週會錄影";
    name.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, name: "週會錄影" },
    });
  });

  // @behavior PJ-182
  it("puts back the toolbar's Project Name when Esc is pressed", async () => {
    const namedProject = projectOf({
      name: "週會錄影",
      options: { ...projectOf().options, name: "週會錄影" },
    });
    await hold(namedProject);
    const name = target<HTMLInputElement>("name");
    name.focus();

    name.value = "lecture";
    name.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();

    expect([
      name.value,
      document.activeElement === name,
      sent("set_project_options"),
    ]).toEqual(["週會錄影", false, undefined]);
  });

  // @behavior PJ-134
  it("tells the user a version changed elsewhere was kept", async () => {
    showNotifications();
    await hold(projectOf());

    await emit("changed-elsewhere-kept");
    await settle();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["字幕已在其他程式修改過並重新讀取"],
      "Tsuzuri 原本的內容已留作備份，可在「版本」比較或還原",
    ]);
  });
});
