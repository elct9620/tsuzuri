// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import {
  DEFAULT_PREFERENCES,
  type Preferences as SavedPreferences,
} from "#/ipc/preferences.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { pageContext } from "#/state/context.ts";
import { SavedPreferences as SharedPreferences } from "#/state/saved-preferences.svelte.ts";
import { showNotifications, notifications } from "#/testing/notifications.ts";
import Preferences from "#/components/settings/preferences/Preferences.svelte";
import { settle } from "#/testing/settle.ts";

describe("Preferences", () => {
  let savedPreferences: SavedPreferences;
  let savedArgs: unknown[];
  let isSavingRefused: boolean;
  /** The Preferences the editor follows, as the settings hand them over. */
  let shared: SharedPreferences;

  /** The switch named `name`, as its Choice Source and its column read. */
  const switchByName = (name: string) =>
    screen.getByRole<HTMLInputElement>("checkbox", { name });

  function turn(toggle: HTMLInputElement): void {
    toggle.checked = !toggle.checked;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function openSettings(): Promise<void> {
    render(Preferences, {
      context: pageContext(
        new ProjectFeed(),
        new EditingSession(editingPort),
        undefined,
        undefined,
        undefined,
        shared,
      ),
    });
    await settle();
  }

  beforeEach(async () => {
    savedPreferences = structuredClone(DEFAULT_PREFERENCES) as SavedPreferences;
    savedArgs = [];
    isSavingRefused = false;
    shared = new SharedPreferences();
    showNotifications();
    mockIPC((command, args) => {
      if (command === "preferences") return savedPreferences;
      if (command === "save_preferences") {
        if (isSavingRefused)
          return Promise.reject({ code: "io", detail: "denied" });
        savedArgs.push(args);
        savedPreferences = (args as { preferences: SavedPreferences })
          .preferences;
        return savedPreferences;
      }
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior PF-003
  it("shows the Preferences saved in their own tab", async () => {
    savedPreferences.choice_landings.text = {
      is_pausing: false,
      is_from_start: false,
    };

    await openSettings();

    expect(
      ["文字或譯文：暫停", "文字或譯文：從頭", "時間：暫停", "時間：從頭"].map(
        (name) => switchByName(name).checked,
      ),
    ).toEqual([false, false, true, true]);
  });

  it("names each switch by its Choice Source and its column", async () => {
    await openSettings();

    expect(
      within(screen.getByText("時間軸區段").closest("tr")!)
        .getAllByRole("checkbox")
        .map((toggle) => toggle.getAttribute("aria-label")),
    ).toEqual(["時間軸區段：暫停", "時間軸區段：從頭"]);
  });

  // @behavior PF-007
  it("explains each Choice Source beneath its name, describing both its switches", async () => {
    await openSettings();

    /** The line beneath a Choice Source's name, and what each of its switches is described by. */
    const explanationBySource = (source: string) => {
      const row = screen.getByText(source).closest("tr")!;
      const line = row.querySelector("th > div:last-child")!;
      return [
        line.textContent?.trim(),
        within(row)
          .getAllByRole("checkbox")
          .map((toggle) => toggle.getAttribute("aria-describedby") === line.id),
      ];
    };

    expect([
      screen.getAllByRole("row").slice(1).length,
      explanationBySource("文字或譯文"),
      explanationBySource("時間"),
    ]).toEqual([
      7,
      ["點另一段的原文或譯文欄位", [true, true]],
      ["點另一段的開始或結束時間", [true, true]],
    ]);
  });

  // @behavior PF-004
  it("saves a switch as soon as it is turned, with every other landing as it was", async () => {
    await openSettings();

    turn(switchByName("文字或譯文：暫停"));
    await settle();

    expect(savedArgs).toEqual([
      {
        preferences: {
          ...DEFAULT_PREFERENCES,
          choice_landings: {
            ...DEFAULT_PREFERENCES.choice_landings,
            text: { is_pausing: false, is_from_start: true },
          },
        },
      },
    ]);
  });

  // @behavior PF-008
  it("keeps the Interface Language chosen when a switch is saved", async () => {
    savedPreferences.interface_language = "en";
    await openSettings();

    turn(switchByName("文字或譯文：暫停"));
    await settle();

    expect(savedPreferences.interface_language).toBe("en");
  });

  // @behavior PF-005
  it("tells the editor the Preferences were saved", async () => {
    await openSettings();

    turn(switchByName("文字或譯文：暫停"));
    await settle();

    expect(shared.current.choice_landings.text).toEqual({
      is_pausing: false,
      is_from_start: true,
    });
  });

  // @behavior PF-006
  it("shows the switch as saved, and says so, when saving fails", async () => {
    await openSettings();
    isSavingRefused = true;
    const pausing = switchByName("文字或譯文：暫停");

    turn(pausing);
    await settle();
    await settle();

    expect([
      pausing.checked,
      shared.current.choice_landings.text.is_pausing,
      notifications().length,
    ]).toEqual([true, true, 1]);
  });
});
