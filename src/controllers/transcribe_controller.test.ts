// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscribeController from "./transcribe_controller";

describe("TranscribeController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="transcribe">
        <p data-transcribe-target="status"></p>
      </div>
    `;
    mockWindows("main");
    mockIPC((command) => (command === "transcribe" ? new Promise(() => {}) : undefined), { shouldMockEvents: true });
    application = Application.start();
    application.register("transcribe", TranscribeController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-007
  it("shows the step and its percentage while transcribing", async () => {
    const controller = application.getControllerForElementAndIdentifier(
      document.querySelector('[data-controller="transcribe"]')!,
      "transcribe",
    ) as TranscribeController;
    void controller.transcribe("/media/lecture.mp4");

    await emit("pipeline-progress", { step: "transcribe", percent: 40 });
    await settle();

    expect(document.querySelector('[data-transcribe-target="status"]')!.textContent).toBe("轉錄 40%");
  });
});
