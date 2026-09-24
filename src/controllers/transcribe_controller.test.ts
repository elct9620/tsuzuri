// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscribeController from "./transcribe_controller";

describe("TranscribeController", () => {
  let application: Application;
  let transcription: Promise<unknown>;
  let translated: unknown;
  let transcribeArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="transcribe">
        <select data-transcribe-target="language">
          <option value="zh-TW">繁體中文</option>
          <option value="en" selected>English</option>
        </select>
        <input type="checkbox" data-transcribe-target="translate">
        <select data-transcribe-target="translationLanguage">
          <option value="en">English</option>
          <option value="ja" selected>日本語</option>
        </select>
        <p data-transcribe-target="status"></p>
        <progress max="100" data-transcribe-target="bar" hidden></progress>
      </div>
    `;
    mockWindows("main");
    transcription = new Promise(() => {});
    translated = undefined;
    mockIPC(
      (command, args) => {
        if (command === "transcribe") {
          transcribeArgs = args;
          return transcription;
        }
        if (command === "translate") {
          translated = args;
          return { phases: [] };
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("transcribe", TranscribeController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  const controller = () =>
    application.getControllerForElementAndIdentifier(
      document.querySelector('[data-controller="transcribe"]')!,
      "transcribe",
    ) as TranscribeController;

  const status = () =>
    document.querySelector('[data-transcribe-target="status"]')!.textContent;

  // @behavior TX-007
  it("shows the Phase and its percentage while transcribing", async () => {
    void controller().transcribe("/media/lecture.mp4");

    await emit("pipeline-progress", { phase: "transcribe", percent: 40 });
    await settle();

    expect(status()).toBe("轉錄 40%");
  });

  // @behavior TX-010
  it("shows a progress bar with no value while the Model loads", async () => {
    void controller().transcribe("/media/lecture.mp4");

    await emit("pipeline-progress", { phase: "load", percent: null });
    await settle();

    const bar = document.querySelector("progress")!;
    expect([bar.hidden, bar.hasAttribute("value")]).toEqual([false, false]);
  });

  // @behavior TX-011
  it("lists how long each Phase took once transcribeArgs", async () => {
    transcription = Promise.resolve({
      audio_seconds: 5,
      transcribe_seconds: 2.7,
      phases: [
        { phase: "prepare", seconds: 0.01 },
        { phase: "convert", seconds: 0.02 },
        { phase: "load", seconds: 1.28 },
        { phase: "transcribe", seconds: 1.44 },
      ],
    });

    await controller().transcribe("/media/lecture.mp4");

    expect(status()).toContain(
      "轉錄：準備元件 0.0 秒 · 轉檔 0.0 秒 · 載入模型 1.3 秒 · 轉錄 1.4 秒",
    );
  });

  // @behavior TX-012
  it("translates the Project once transcribeArgs when asked to", async () => {
    transcription = Promise.resolve({
      audio_seconds: 1,
      transcribe_seconds: 1,
      phases: [],
    });
    document.querySelector<HTMLInputElement>(
      '[data-transcribe-target="translate"]',
    )!.checked = true;

    await controller().transcribe("/media/lecture.mp4");

    expect(translated).toMatchObject({ target: "ja" });
  });

  // @behavior TL-016
  it("translates from the Language it just transcribeArgs", async () => {
    transcription = Promise.resolve({
      audio_seconds: 1,
      transcribe_seconds: 1,
      phases: [],
    });
    document.querySelector<HTMLInputElement>(
      '[data-transcribe-target="translate"]',
    )!.checked = true;

    await controller().transcribe("/media/lecture.mp4");

    expect(translated).toMatchObject({ source: "en" });
  });

  // @behavior TX-016
  it("transcribes in the selected Language", async () => {
    transcription = Promise.resolve({
      audio_seconds: 1,
      transcribe_seconds: 1,
      phases: [],
    });

    await controller().transcribe("/media/lecture.mp4");

    expect(transcribeArgs).toEqual({
      path: "/media/lecture.mp4",
      language: "en",
    });
  });
});
