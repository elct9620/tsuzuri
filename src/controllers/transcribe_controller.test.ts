// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscribeController from "./transcribe_controller";

describe("TranscribeController", () => {
  let application: Application;
  let transcription: Promise<unknown>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="transcribe">
        <p data-transcribe-target="status"></p>
        <progress max="100" data-transcribe-target="bar" hidden></progress>
      </div>
    `;
    mockWindows("main");
    transcription = new Promise(() => {});
    mockIPC(
      (command) => (command === "transcribe" ? transcription : undefined),
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
  it("lists how long each Phase took once transcribed", async () => {
    transcription = Promise.resolve({
      segments: [],
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
});
