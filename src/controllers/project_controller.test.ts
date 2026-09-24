// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../project";
import { projectOf, resourceOf } from "../test_project";
import ProjectController from "./project_controller";

describe("ProjectController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let openSrt: () => unknown;

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
    document.body.innerHTML = `
      <main data-controller="project">
        <section data-project-target="start"></section>
        <div data-project-target="workspace" hidden>
          <h1 data-project-target="name"></h1>
          <div class="dropdown">
            <div tabindex="0" role="button">開啟</div>
            <button id="open-directory" data-action="project#openDirectory">開啟目錄</button>
            <button id="open-srt" data-action="project#openSrt">開啟 SRT</button>
          </div>
          <ul data-project-target="resources"></ul>
          <p data-project-target="glossary"></p>
        </div>
        <fieldset data-project-target="settings" hidden>
          <select data-project-target="language" data-action="change->project#setLanguage">
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
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
            : "/subtitles/lecture.srt";
        if (command === "open_srt") return openSrt();
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("project", ProjectController);
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
          resourceOf({ translation_languages: ["en"] }),
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

  // @behavior PJ-036
  it("shows only the start screen without a Project", async () => {
    await hold(null);

    expect([
      target("start").hidden,
      target("workspace").hidden,
      target("settings").hidden,
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
});
