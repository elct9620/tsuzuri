// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscriptionSettingsController from "./transcription_settings_controller";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";

describe("TranscriptionSettingsController", () => {
  let application: Application;
  let savedArgs: unknown;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const input = (target: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-transcription-settings-target="${target}"]`,
    )!;

  beforeEach(async () => {
    savedArgs = undefined;
    failingCommand = null;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <div data-controller="transcription-settings">
        <input type="checkbox" data-transcription-settings-target="vad" data-action="change->transcription-settings#save">
        <input type="checkbox" data-transcription-settings-target="nonSpeechSuppressed" data-action="change->transcription-settings#save">
        <input type="checkbox" data-transcription-settings-target="contextCarried" data-action="change->transcription-settings#save">
        <input type="checkbox" data-transcription-settings-target="simplifiedCleaned" data-action="change->transcription-settings#save">
      </div>
    `;
    mockIPC((command, args) => {
      if (command === failingCommand)
        return Promise.reject({ code: "io", detail: "denied" });
      if (command === "transcription_settings")
        return {
          has_vad: false,
          is_non_speech_suppressed: false,
          is_context_carried: true,
          is_simplified_cleaned: true,
        };
      if (command === "save_transcription_settings") {
        savedArgs = args;
        return (args as { settings: unknown }).settings;
      }
    });
    application = Application.start();
    application.register(
      "transcription-settings",
      TranscriptionSettingsController,
    );
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-039
  it("saves VAD turned on in the general settings with the rest as they were", async () => {
    const vad = input("vad");

    vad.checked = true;
    vad.dispatchEvent(new Event("change"));
    await settle();

    expect(savedArgs).toEqual({
      settings: {
        has_vad: true,
        is_non_speech_suppressed: false,
        is_context_carried: true,
        is_simplified_cleaned: true,
      },
    });
  });

  // @behavior TX-053
  it("says the settings were not read", async () => {
    application.stop();
    failingCommand = "transcription_settings";

    application = Application.start();
    application.register(
      "transcription-settings",
      TranscriptionSettingsController,
    );
    await settle();

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior TX-054
  it("says the settings were not saved when saving is refused", async () => {
    failingCommand = "save_transcription_settings";

    input("vad").dispatchEvent(new Event("change"));
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });
});
