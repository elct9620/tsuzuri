// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranslateController from "./translate_controller";

describe("TranslateController", () => {
  let application: Application;
  let translateArgs: unknown;

  const segments = [{ start_ms: 0, end_ms: 1000, text: "大家好" }];

  beforeEach(async () => {
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
        if (command === "open_srt") return segments;
        if (command === "translate") {
          translateArgs = args;
          return {
            segments: [{ ...segments[0], translation: "皆さん、こんにちは" }],
            phases: [],
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
});
