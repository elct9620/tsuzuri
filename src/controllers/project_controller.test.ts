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
import ProjectController from "./project_controller";

describe("ProjectController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let openSrt: () => unknown;
  let selectFailure: unknown;
  let reloaded: () => unknown;
  let chosenFile: string;

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

  beforeEach(async () => {
    project = null;
    calls = [];
    openSrt = () => null;
    selectFailure = undefined;
    reloaded = () => null;
    chosenFile = "/subtitles/lecture.srt";
    document.body.innerHTML = `
      <main
        data-controller="project"
        data-action="keydown.ctrl+r@window->project#reload:prevent keydown.meta+r@window->project#reload:prevent"
      >
        <section data-project-target="startScreen"></section>
        <div data-project-target="workspace" hidden>
          <h1 data-project-target="name"></h1>
          <div class="dropdown">
            <div tabindex="0" role="button">開啟</div>
            <button id="open-directory" data-action="project#openDirectory">開啟目錄</button>
            <button id="open-srt" data-action="project#openSrt">開啟 SRT</button>
          </div>
          <button id="reload" data-action="project#reload">重新載入</button>
          <ul data-project-target="resources"></ul>
          <p data-project-target="glossary"></p>
        </div>
        <input type="radio" name="tabs" id="project-tab" data-project-target="projectTab settings" checked />
        <input type="radio" name="tabs" id="general-tab" data-project-target="generalTab" />
        <fieldset data-project-target="settings">
          <select data-project-target="language" data-action="change->project#setLanguage">
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
          <select data-project-target="bilingualOrder" data-action="change->project#setOptions">
            <option value="original-first">原文在上</option>
            <option value="translation-first">譯文在上</option>
          </select>
          <input type="checkbox" data-project-target="bilingualAutosave" data-action="change->project#setOptions" />
          <input type="checkbox" data-project-target="overwriteBackup" data-action="change->project#setOptions" />
          <select data-project-target="transcriptionSetting" data-setting="has_vad" data-action="change->project#setOptions">
            <option value="">依整體設定</option>
            <option value="on">開啟</option>
            <option value="off">關閉</option>
          </select>
          <span data-project-target="projectModel" data-slot="transcription"></span>
          <button id="follow-transcription-model" data-project-target="generalModelButton" data-slot="transcription" data-action="project#followModel">改用整體設定</button>
          <span data-project-target="projectModel" data-slot="translation"></span>
          <button id="choose-translation-model" data-slot="translation" data-action="project#chooseModel">指定檔案</button>
        </fieldset>
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
        if (command === "reload_project") return reloaded();
        if (command === "select_resource" && selectFailure !== undefined)
          return Promise.reject(selectFailure);
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    await assemble(application, {
      project: ProjectController,
    }).start();
    await settle();
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

  // @behavior ED-011
  it("reads the Project again when a Resource cannot be selected", async () => {
    await hold(
      projectOf({
        resources: [resourceOf(), resourceOf({ name: "ep02" })],
      }),
    );
    selectFailure = { code: "malformed-srt", cue: 2 };
    const asked = calls.filter(
      (call) => call.command === "current_project",
    ).length;

    await click('[data-name="ep02"]');

    expect(
      calls.filter((call) => call.command === "current_project").length,
    ).toBeGreaterThan(asked);
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
    reloaded = () => order.push("reload");

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

  // @behavior PJ-037
  it("sets the Primary Language chosen in the settings", async () => {
    await hold(projectOf());
    const language = target<HTMLSelectElement>("language");

    language.value = "ja";
    language.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_primary_language")).toEqual({ language: "ja" });
  });

  // @behavior PJ-047
  it("sets the Bilingual Order chosen in the settings", async () => {
    await hold(projectOf());
    const order = target<HTMLSelectElement>("bilingualOrder");

    order.value = "translation-first";
    order.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        bilingual_order: "translation-first",
      },
    });
  });

  // @behavior TX-040
  it("sets VAD on for the Project with the rest following the general settings", async () => {
    await hold(projectOf());
    const vad = target<HTMLSelectElement>("transcriptionSetting");

    vad.value = "on";
    vad.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        transcription: {
          has_vad: true,
          is_non_speech_suppressed: null,
          is_context_carried: null,
        },
      },
    });
  });

  // @behavior MD-008
  it("sets the file picked for the translation slot as the Project Model", async () => {
    await hold(projectOf());
    chosenFile = "/models/gemma-ja.gguf";

    await click("#choose-translation-model");

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        models: { transcription: null, translation: "/models/gemma-ja.gguf" },
      },
    });
  });

  // @behavior MD-009
  it("says a slot without a Project Model follows the general settings", async () => {
    await hold(projectOf());

    expect([
      document.querySelector('[data-project-target="projectModel"]')!
        .textContent,
      document.querySelector<HTMLElement>("#follow-transcription-model")!
        .hidden,
    ]).toEqual(["依整體設定", true]);
  });

  // @behavior MD-010
  it("sets the Project Options without the Project Model once the slot follows the general settings", async () => {
    const withModel = projectOf();
    withModel.options.models.transcription = "/models/kotoba.bin";
    await hold(withModel);

    await click("#follow-transcription-model");

    expect(sent("set_project_options")).toEqual({
      options: projectOf().options,
    });
  });

  // @behavior PJ-048
  it("offers only the general settings without a Project", async () => {
    await hold(null);

    expect([
      document.querySelector<HTMLInputElement>("#project-tab")!.hidden,
      document.querySelector<HTMLElement>("fieldset")!.hidden,
      document.querySelector<HTMLInputElement>("#general-tab")!.checked,
    ]).toEqual([true, true, true]);
  });

  // @behavior PJ-049
  it("opens the settings at the Project's own once a Project is open", async () => {
    await hold(null);

    await hold(projectOf());

    expect(
      document.querySelector<HTMLInputElement>("#project-tab")!.checked,
    ).toBe(true);
  });

  // @behavior PJ-055
  it("sets the Project to save Bilingual SRTs when turned on in the settings", async () => {
    await hold(projectOf());
    const autosave = target<HTMLInputElement>("bilingualAutosave");

    autosave.checked = true;
    autosave.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_bilingual_autosaved: true },
    });
  });

  // @behavior PJ-070
  it("sets the Project to keep Backups when turned on in the settings", async () => {
    await hold(projectOf());
    const backup = target<HTMLInputElement>("overwriteBackup");

    backup.checked = true;
    backup.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: { ...projectOf().options, is_overwrite_backed_up: true },
    });
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
