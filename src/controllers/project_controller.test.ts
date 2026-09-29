// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import {
  NOTIFICATION_STACK,
  notificationDetail,
  notifications,
} from "../ui/test_notification";
import { composingOption } from "./field_controller";
import ProjectController from "./project_controller";

describe("ProjectController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let openSrt: () => unknown;
  let openProject: () => unknown;
  let selectFailure: unknown;
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
    selectFailure = undefined;
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
          <input type="checkbox" data-project-target="resourcesToggle" />
          <ul data-project-target="resources"></ul>
          <p data-project-target="glossary"></p>
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
          const taken = requestedSrt;
          requestedSrt = null;
          return taken;
        }
        if (command === "select_resource" && selectFailure !== undefined)
          return Promise.reject(selectFailure);
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

    await click("#open-srt");

    expect(JSON.stringify(sent("plugin:dialog|message"))).toContain(
      "SRT 第 2 段無法讀取",
    );
  });

  // @behavior PJ-167
  it("warns that another Project cannot open while a task runs", async () => {
    openProject = () => {
      throw { code: "opening-during-mode" };
    };

    await click("#open-directory");

    expect(sent("plugin:dialog|message")).toMatchObject({
      message: "任務執行中無法開啟其他專案，請等任務結束或先取消",
      kind: "warning",
    });
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

  // @behavior PJ-034
  it("lists each Resource with its translations and whether it has a subtitle", async () => {
    await hold(
      projectOf({
        resources: [
          resourceOf({ has_media: true, translation_languages: ["en"] }),
          resourceOf({ name: "ep02", has_media: true, has_subtitle: false }),
        ],
      }),
    );

    const items = [...target("resources").querySelectorAll("button")].map(
      (button) => ({
        name: button.dataset.name,
        badges: [...button.querySelectorAll(".badge")].map(
          (badge) => badge.textContent,
        ),
        hasNoSubtitle: button.querySelector(".status") !== null,
        isCurrent: button.classList.contains("menu-active"),
      }),
    );
    expect(items).toEqual([
      { name: "ep01", badges: ["en"], hasNoSubtitle: false, isCurrent: true },
      { name: "ep02", badges: [], hasNoSubtitle: true, isCurrent: false },
    ]);
  });

  // @behavior PJ-117
  it("marks a Resource of subtitles alone", async () => {
    await hold(
      projectOf({
        resources: [
          resourceOf({ has_media: true }),
          resourceOf({ name: "notes", has_media: false }),
        ],
      }),
    );

    const markedNames = [
      ...target("resources").querySelectorAll('[data-kind="subtitle"]'),
    ].map((badge) => badge.closest("button")?.dataset.name);
    expect(markedNames).toEqual(["notes"]);
  });

  // @behavior PJ-038
  it("names a Resource in full in its tooltip", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ name: "[SHANA]C0220260514.zh-TW.mix" })],
      }),
    );

    const button = target("resources").querySelector("button");
    expect(button?.dataset.tooltip).toBe("[SHANA]C0220260514.zh-TW.mix");
  });

  // @behavior GL-006
  it("offers to create a Translation Glossary when the Project has none", async () => {
    await hold(projectOf({ translation_glossary: null }));

    expect(target("glossary").textContent).toBe("建立詞彙表");
  });

  // @behavior PJ-035
  it("selects the Resource clicked in the list", async () => {
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
      }),
    );

    await click('[data-name="ep02"]');

    expect(sent("select_resource")).toEqual({ name: "ep02" });
  });

  // @behavior PJ-183
  it("puts the Resource list away once a Resource is chosen", async () => {
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
      }),
    );
    const toggle = target<HTMLInputElement>("resourcesToggle");
    toggle.checked = true;

    await click('[data-name="ep02"]');

    expect([sent("select_resource"), toggle.checked]).toEqual([
      { name: "ep02" },
      false,
    ]);
  });

  // @behavior ED-011
  it("reads the Project again when a Resource cannot be selected", async () => {
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
      }),
    );
    selectFailure = { code: "malformed-srt", cue: 2 };
    const currentProjectReads = calls.filter(
      (call) => call.command === "current_project",
    ).length;

    await click('[data-name="ep02"]');

    expect(
      calls.filter((call) => call.command === "current_project").length,
    ).toBeGreaterThan(currentProjectReads);
  });

  // @behavior ED-010
  it("tells the editor a Resource is being read once one is selected", async () => {
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
      }),
    );
    let isAnnounced = false;
    document.addEventListener("project:select", () => (isAnnounced = true));

    await click('[data-name="ep02"]');

    expect(isAnnounced).toBe(true);
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
    target("resources").append(field);
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
    document.body.insertAdjacentHTML("beforeend", NOTIFICATION_STACK);
    await hold(projectOf());

    await emit("changed-elsewhere-kept");
    await settle();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["字幕已在其他程式修改過並重新讀取"],
      "Tsuzuri 原本的內容已留作備份，可在「版本」比較或還原",
    ]);
  });
});
