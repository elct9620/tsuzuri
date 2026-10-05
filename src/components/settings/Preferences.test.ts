// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editingPort } from "../../backend/editing";
import {
  DEFAULT_PREFERENCES,
  type Preferences as SavedPreferences,
} from "../../backend/preferences";
import { ProjectFeed } from "../../backend/project";
import { EditingSession } from "../../editor";
import { pageContext } from "../context";
import { SavedPreferences as SharedPreferences } from "../saved-preferences.svelte";
import { showNotifications, notifications } from "../test-notifications";
import Preferences from "./Preferences.svelte";

describe("Preferences", () => {
  let savedPreferences: SavedPreferences;
  let savedArgs: unknown[];
  let isSavingRefused: boolean;
  /** The Preferences the editor follows, as the settings hand them over. */
  let shared: SharedPreferences;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
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
      within(screen.getByText("時間軸區段").closest("li")!)
        .getAllByRole("checkbox")
        .map((toggle) => toggle.getAttribute("aria-label")),
    ).toEqual(["時間軸區段：暫停", "時間軸區段：從頭"]);
  });

  it("explains when each Choice Source is chosen from beside its name", async () => {
    await openSettings();

    const helpBySource = (source: string) =>
      within(screen.getByText(source).closest("li")!)
        .getByRole("button")
        .getAttribute("aria-label");

    expect([
      screen.getAllByRole("listitem").slice(1).length,
      helpBySource("文字或譯文"),
      helpBySource("時間"),
    ]).toEqual([7, "點另一段的原文或譯文欄位", "點另一段的開始或結束時間"]);
  });

  // @behavior PF-004
  it("saves a switch as soon as it is turned, with every other landing as it was", async () => {
    await openSettings();

    turn(switchByName("文字或譯文：暫停"));
    await settle();

    expect(savedArgs).toEqual([
      {
        preferences: {
          choice_landings: {
            ...DEFAULT_PREFERENCES.choice_landings,
            text: { is_pausing: false, is_from_start: true },
          },
        },
      },
    ]);
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
