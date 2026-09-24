// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranslateController from "./translate_controller";

describe("TranslateController", () => {
  let application: Application;
  let translateArgs: unknown;
  let openSrt: () => unknown;

  const segments = [{ start_ms: 0, end_ms: 1000, text: "大家好" }];

  beforeEach(async () => {
    openSrt = () => segments;
    document.body.innerHTML = `
      <div data-controller="translate">
        <select data-translate-target="language">
          <option value="English">English</option>
          <option value="Japanese" selected>日本語</option>
        </select>
        <button data-action="translate#choose">選擇 SRT</button>
        <p data-translate-target="status"></p>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "plugin:dialog|open") return "/subtitles/lecture.srt";
        if (command === "open_srt") return openSrt();
        if (command === "translate") {
          translateArgs = args;
          return {
            segments: [{ ...segments[0], translation: "皆さん、こんにちは" }],
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TL-005
  it("translates the chosen SRT file into the selected language", async () => {
    document.querySelector("button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(translateArgs).toEqual({ segments, target: "Japanese" });
  });

  // @behavior TL-008
  it("lists how long each Phase took once translated", async () => {
    document.querySelector("button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(
      document.querySelector('[data-translate-target="status"]')!.textContent,
    ).toBe("完成\n準備元件 0.0 秒 · 載入模型 2.2 秒 · 翻譯 0.6 秒");
  });

  // @behavior TL-009
  it("says which cue kept the SRT file from being read", async () => {
    openSrt = () => {
      throw { code: "malformed-srt", cue: 2 };
    };

    document.querySelector<HTMLButtonElement>("button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      document.querySelector('[data-translate-target="status"]')!.textContent,
    ).toBe("失敗：SRT 第 2 段無法讀取");
  });
});
