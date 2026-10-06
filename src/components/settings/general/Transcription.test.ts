// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Transcription from "#/components/settings/general/Transcription.svelte";
import { showNotifications, notifications } from "#/testing/notifications.ts";

describe("Transcription", () => {
  let savedArgs: unknown;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** The switch of the row named `name`. */
  const toggle = (name: string) =>
    within(screen.getByText(name).closest("li")!).getByRole<HTMLInputElement>(
      "checkbox",
    );

  async function openSettings(): Promise<void> {
    render(Transcription);
    await settle();
  }

  beforeEach(() => {
    savedArgs = undefined;
    failingCommand = null;
    showNotifications();
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
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TX-039
  it("saves VAD turned on in the general settings with the rest as they were", async () => {
    await openSettings();

    toggle("VAD").click();
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
    failingCommand = "transcription_settings";

    await openSettings();

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior TX-054
  it("says the settings were not saved when saving is refused", async () => {
    failingCommand = "save_transcription_settings";
    await openSettings();

    toggle("VAD").click();
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });
});
