// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../project";
import TranslateController from "./translate_controller";

describe("TranslateController", () => {
  let application: Application;
  let translateArgs: unknown;
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const start = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-translate-target="start"]',
    )!;

  async function holdProject(language = "zh-TW"): Promise<void> {
    project = {
      media: null,
      language,
      translation_language: null,
      segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
    };
    await emit("project-changed");
    await settle();
  }

  beforeEach(async () => {
    project = null;
    translateArgs = undefined;
    document.body.innerHTML = `
      <div data-controller="translate">
        <select data-translate-target="language">
          <option value="en">English</option>
          <option value="ja" selected>日本語</option>
        </select>
        <button data-translate-target="start" data-action="translate#translate" disabled>開始翻譯</button>
        <p data-translate-target="status"></p>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "translate") {
          translateArgs = args;
          return {
            phases: [
              { phase: "prepare", seconds: 0.01 },
              { phase: "load", seconds: 2.17 },
              { phase: "translate", seconds: 0.61 },
            ],
          };
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("translate", TranslateController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TL-005
  it("translates the Project into the selected language", async () => {
    await holdProject();

    start().click();
    await settle();

    expect(translateArgs).toMatchObject({ target: "ja" });
  });

  // @behavior TL-015
  it("translates the Project from the Language it is in", async () => {
    await holdProject("ja");

    start().click();
    await settle();

    expect(translateArgs).toMatchObject({ source: "ja" });
  });

  // @behavior TL-008
  it("lists how long each Phase took once translated", async () => {
    await holdProject();

    start().click();
    await settle();

    expect(
      document.querySelector('[data-translate-target="status"]')!.textContent,
    ).toBe("完成\n準備元件 0.0 秒 · 載入模型 2.2 秒 · 翻譯 0.6 秒");
  });

  // @behavior TL-011
  it("waits for a Project before translating can start", async () => {
    const before = start().disabled;

    await holdProject();

    expect([before, start().disabled]).toEqual([true, false]);
  });
});
