// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ModelsController from "./models_controller";

describe("ModelsController", () => {
  let application: Application;

  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function mountWith(
    settings: unknown,
    handlers: Record<string, (args: unknown) => unknown> = {},
  ): Promise<void> {
    mockIPC((command, args) =>
      command === "model_settings" ? settings : handlers[command]?.(args),
    );
    application = Application.start();
    application.register("models", ModelsController);
    await settle();
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
        <button data-slot="translation" data-action="models#choose"></button>
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
      transcription: { path: "/models/breeze.bin", has_file: true },
      translation: { path: null, has_file: false },
    });

    expect(statusOf("transcription")).toBe("/models/breeze.bin");
  });

  // @behavior MD-005
  it("asks again for a model whose file is gone", async () => {
    await mountWith({
      transcription: { path: null, has_file: false },
      translation: { path: "/models/qwen3-4b.gguf", has_file: false },
    });

    expect(statusOf("translation")).toContain("請重新指定");
  });

  // @behavior MD-006
  it("remembers a model chosen in the panel and shows its path", async () => {
    let chooseModelArgs: unknown;
    await mountWith(
      {
        transcription: { path: null, has_file: false },
        translation: { path: null, has_file: false },
      },
      {
        "plugin:dialog|open": () => "/models/qwen3-4b.gguf",
        choose_model: (args) => {
          chooseModelArgs = args;
          return {
            transcription: { path: null, has_file: false },
            translation: { path: "/models/qwen3-4b.gguf", has_file: true },
          };
        },
      },
    );

    document.querySelector<HTMLButtonElement>("button")!.click();
    await settle();

    expect(chooseModelArgs).toEqual({
      slot: "translation",
      path: "/models/qwen3-4b.gguf",
    });
    expect(statusOf("translation")).toBe("/models/qwen3-4b.gguf");
  });
});
