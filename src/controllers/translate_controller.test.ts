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
  let commands: string[];
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const start = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-translate-target="start"]',
    )!;

  async function holdProject(
    language = "zh-TW",
    glossary: ProjectView["translation_glossary"] = null,
  ): Promise<void> {
    project = {
      media: null,
      language,
      translation_language: null,
      translation_glossary: glossary,
      segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
    };
    await emit("project-changed");
    await settle();
  }

  beforeEach(async () => {
    project = null;
    translateArgs = undefined;
    commands = [];
    document.body.innerHTML = `
      <div data-controller="translate">
        <select data-translate-target="source">
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
        <select data-translate-target="language">
          <option value="en">English</option>
          <option value="ja" selected>日本語</option>
        </select>
        <input type="checkbox" data-translate-target="speakerLabels">
        <input type="checkbox" data-translate-target="selfReview">
        <input type="checkbox" data-translate-target="summary">
        <input type="number" value="100" data-translate-target="summaryWords">
        <span data-translate-target="glossary"></span>
        <button data-translate-target="start" data-action="translate#translate" disabled>開始翻譯</button>
        <p data-translate-target="status"></p>
      </div>
    `;
    mockIPC(
      (command, args) => {
        commands.push(command);
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

  // @behavior TL-042
  it("names the Project's glossary.csv and its terms", async () => {
    await holdProject("zh-TW", {
      file: "/talks/glossary.csv",
      term_count: 12,
    });

    expect(
      document.querySelector('[data-translate-target="glossary"]')!.textContent,
    ).toBe("glossary.csv（12 筆）");
  });

  function check(target: string): void {
    document.querySelector<HTMLInputElement>(
      `[data-translate-target="${target}"]`,
    )!.checked = true;
  }

  // @behavior TL-056
  it("translates with the options the panel offers", async () => {
    await holdProject();
    check("speakerLabels");
    check("selfReview");
    check("summary");
    document.querySelector<HTMLInputElement>(
      '[data-translate-target="summaryWords"]',
    )!.value = "80";

    start().click();
    await settle();

    expect(translateArgs).toMatchObject({
      options: {
        has_speaker_labels: true,
        has_self_review: true,
        summary_word_limit: 80,
      },
    });
  });

  // @behavior TL-057
  it("translates from another source Language", async () => {
    await holdProject("ja");
    document.querySelector<HTMLSelectElement>(
      '[data-translate-target="source"]',
    )!.value = "en";

    start().click();
    await settle();

    expect(translateArgs).toMatchObject({ source: "en" });
  });
});
