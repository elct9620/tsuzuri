// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscriptionSettingsController from "./transcription_settings_controller";

describe("TranscriptionSettingsController", () => {
  let application: Application;
  let savedArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const input = (target: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-transcription-settings-target="${target}"]`,
    )!;

  beforeEach(async () => {
    savedArgs = undefined;
    document.body.innerHTML = `
      <div data-controller="transcription-settings">
        <input type="checkbox" data-transcription-settings-target="vad" data-action="change->transcription-settings#save">
        <input type="checkbox" data-transcription-settings-target="nonSpeechSuppressed" data-action="change->transcription-settings#save">
        <input type="checkbox" data-transcription-settings-target="contextCarried" data-action="change->transcription-settings#save">
      </div>
    `;
    mockIPC((command, args) => {
      if (command === "transcription_settings")
        return {
          has_vad: false,
          is_non_speech_suppressed: false,
          is_context_carried: true,
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
      },
    });
  });
});
