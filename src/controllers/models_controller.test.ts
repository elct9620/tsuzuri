// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ModelsController from "./models_controller";

describe("ModelsController", () => {
  let application: Application;

  async function mountWith(settings: unknown): Promise<void> {
    mockIPC((command) => (command === "model_settings" ? settings : undefined));
    application = Application.start();
    application.register("models", ModelsController);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function statusOf(slot: string): string {
    return document.querySelector(
      `[data-models-target="status"][data-slot="${slot}"]`,
    )!.textContent!;
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <dl data-controller="models">
        <dd data-models-target="status" data-slot="transcription"></dd>
        <dd data-models-target="status" data-slot="translation"></dd>
      </dl>
    `;
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior MD-004
  it("shows the chosen model's path", async () => {
    await mountWith({
      transcription: { path: "/models/breeze.bin", exists: true },
      translation: { path: null, exists: false },
    });

    expect(statusOf("transcription")).toBe("/models/breeze.bin");
  });

  // @behavior MD-005
  it("asks again for a model whose file is gone", async () => {
    await mountWith({
      transcription: { path: null, exists: false },
      translation: { path: "/models/qwen3-4b.gguf", exists: false },
    });

    expect(statusOf("translation")).toContain("請重新指定");
  });
});
