// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranslationSettingsController from "./translation_settings_controller";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";

describe("TranslationSettingsController", () => {
  let application: Application;
  let savedArgs: unknown;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const input = (target: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-translation-settings-target="${target}"]`,
    )!;

  beforeEach(async () => {
    savedArgs = undefined;
    failingCommand = null;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <div data-controller="translation-settings">
        <input data-translation-settings-target="batchSize" data-action="change->translation-settings#save">
        <input data-translation-settings-target="retries" data-action="change->translation-settings#save">
        <input data-translation-settings-target="referenceLines" data-action="change->translation-settings#save">
        <input type="checkbox" data-translation-settings-target="residentLlama" data-action="change->translation-settings#save">
        <input data-translation-settings-target="modelKeepSeconds" data-action="change->translation-settings#save">
        <input type="checkbox" data-translation-settings-target="simplifiedCleaned" data-action="change->translation-settings#save">
      </div>
    `;
    mockIPC((command, args) => {
      if (command === failingCommand)
        return Promise.reject({ code: "io", detail: "denied" });
      if (command === "translation_settings")
        return {
          batch_size: 8,
          retries: 3,
          reference_lines: 2,
          has_resident_llama: true,
          model_keep_seconds: 0,
          is_simplified_cleaned: true,
        };
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
      settings: {
        batch_size: 4,
        retries: 3,
        reference_lines: 2,
        has_resident_llama: true,
        model_keep_seconds: 0,
        is_simplified_cleaned: true,
      },
    });
  });

  // @behavior TL-077
  it("saves the Resident llama-server turned off and stops offering the kept seconds", async () => {
    const residentLlama = input("residentLlama");

    residentLlama.checked = false;
    residentLlama.dispatchEvent(new Event("change"));
    await settle();

    expect([
      (savedArgs as { settings: { has_resident_llama: boolean } }).settings
        .has_resident_llama,
      input("modelKeepSeconds").disabled,
    ]).toEqual([false, true]);
  });

  // @behavior TL-094
  it("says the settings were not read", async () => {
    application.stop();
    failingCommand = "translation_settings";

    application = Application.start();
    application.register("translation-settings", TranslationSettingsController);
    await settle();

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior TL-095
  it("says the settings were not saved when saving is refused", async () => {
    failingCommand = "save_translation_settings";

    input("batchSize").dispatchEvent(new Event("change"));
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });
});
