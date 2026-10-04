// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, type Preferences } from "../backend/preferences";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import PreferencesController from "./preferences_controller";

describe("PreferencesController", () => {
  let application: Application;
  let savedPreferences: Preferences;
  let savedArgs: unknown[];
  let isSavingRefused: boolean;
  let savedEvents: number;
  let listening: AbortController;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const landingSwitch = (source: string, half: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-choice-source="${source}"][data-landing-switch="${half}"]`,
    )!;

  function turn(toggle: HTMLInputElement): void {
    toggle.checked = !toggle.checked;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function openSettings(): Promise<void> {
    application = Application.start();
    application.register("preferences", PreferencesController);
    await settle();
  }

  beforeEach(async () => {
    savedPreferences = structuredClone(DEFAULT_PREFERENCES) as Preferences;
    savedArgs = [];
    isSavingRefused = false;
    savedEvents = 0;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <fieldset data-controller="preferences">
        <ul data-preferences-target="landings"></ul>
      </fieldset>
    `;
    listening = new AbortController();
    window.addEventListener("preferences:saved", () => savedEvents++, {
      signal: listening.signal,
    });
    mockIPC((command, args) => {
      if (command === "preferences") return savedPreferences;
      if (command === "save_preferences") {
        if (isSavingRefused)
          return Promise.reject({ code: "io", detail: "denied" });
        savedArgs.push(args);
        savedPreferences = (args as { preferences: Preferences }).preferences;
        return savedPreferences;
      }
    });
  });

  afterEach(() => {
    application.stop();
    listening.abort();
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
      [
        ["text", "is_pausing"],
        ["text", "is_from_start"],
        ["time", "is_pausing"],
        ["time", "is_from_start"],
      ].map(([source, half]) => landingSwitch(source, half).checked),
    ).toEqual([false, false, true, true]);
  });

  it("names each switch by its Choice Source and its column", async () => {
    await openSettings();

    expect(
      landingSwitch("region", "is_from_start").getAttribute("aria-label"),
    ).toBe("時間軸區段：從頭");
  });

  it("explains when each Choice Source is chosen from beside its name", async () => {
    await openSettings();

    const helps = [
      ...document.querySelectorAll<HTMLElement>(".list-row [data-tooltip]"),
    ].map((help) => help.dataset.tooltip);

    expect([
      helps.length,
      helps.every((help) => help && !help.startsWith("preferences.")),
    ]).toEqual([7, true]);
  });

  // @behavior PF-004
  it("saves a switch as soon as it is turned, with every other landing as it was", async () => {
    await openSettings();

    turn(landingSwitch("text", "is_pausing"));
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

    turn(landingSwitch("text", "is_pausing"));
    await settle();

    expect(savedEvents).toBe(1);
  });

  // @behavior PF-006
  it("shows the switch as saved, and says so, when saving fails", async () => {
    await openSettings();
    isSavingRefused = true;
    const pausing = landingSwitch("text", "is_pausing");

    turn(pausing);
    await settle();
    await settle();

    expect([pausing.checked, savedEvents, notifications().length]).toEqual([
      true,
      0,
      1,
    ]);
  });
});
