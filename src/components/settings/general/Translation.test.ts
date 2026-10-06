// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Translation from "#/components/settings/general/Translation.svelte";
import {
  showNotifications,
  notifications,
} from "#/components/test-notifications.ts";

describe("Translation", () => {
  let savedArgs: unknown;
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** The field of the row named `name`, of the given role. */
  const field = (name: string, role: "spinbutton" | "checkbox") =>
    within(screen.getByText(name).closest("li")!).getByRole<HTMLInputElement>(
      role,
    );

  async function openSettings(): Promise<void> {
    render(Translation);
    await settle();
  }

  beforeEach(() => {
    savedArgs = undefined;
    failingCommand = null;
    showNotifications();
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
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TL-055
  it("saves a translation setting changed on the settings panel", async () => {
    await openSettings();
    const batchSize = field("每批句數", "spinbutton");

    await fireEvent.input(batchSize, { target: { value: "4" } });
    await fireEvent.change(batchSize);
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
    await openSettings();

    field("常駐 llama-server", "checkbox").click();
    await settle();

    expect([
      (savedArgs as { settings: { has_resident_llama: boolean } }).settings
        .has_resident_llama,
      field("翻譯後保留模型", "spinbutton").disabled,
    ]).toEqual([false, true]);
  });

  // @behavior TL-094
  it("says the settings were not read", async () => {
    failingCommand = "translation_settings";

    await openSettings();

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior TL-095
  it("says the settings were not saved when saving is refused", async () => {
    failingCommand = "save_translation_settings";
    await openSettings();

    await fireEvent.change(field("每批句數", "spinbutton"));
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });
});
