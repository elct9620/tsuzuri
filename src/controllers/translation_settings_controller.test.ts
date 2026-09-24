// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranslationSettingsController from "./translation_settings_controller";

describe("TranslationSettingsController", () => {
  let application: Application;
  let savedArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const input = (target: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-translation-settings-target="${target}"]`,
    )!;

  beforeEach(async () => {
    savedArgs = undefined;
    document.body.innerHTML = `
      <div data-controller="translation-settings">
        <input data-translation-settings-target="batchSize" data-action="change->translation-settings#save">
        <input data-translation-settings-target="retries" data-action="change->translation-settings#save">
        <input data-translation-settings-target="referenceLines" data-action="change->translation-settings#save">
      </div>
    `;
    mockIPC((command, args) => {
      if (command === "translation_settings")
        return { batch_size: 8, retries: 3, reference_lines: 2 };
      if (command === "save_translation_settings") {
        savedArgs = args;
        return (args as { settings: unknown }).settings;
      }
    });
    application = Application.start();
    application.register("translation-settings", TranslationSettingsController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TL-055
  it("saves a translation setting changed on the settings panel", async () => {
    const batchSize = input("batchSize");

    batchSize.value = "4";
    batchSize.dispatchEvent(new Event("change"));
    await settle();

    expect(savedArgs).toEqual({
      settings: { batch_size: 4, retries: 3, reference_lines: 2 },
    });
  });
});
