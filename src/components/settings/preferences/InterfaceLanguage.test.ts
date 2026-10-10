// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import {
  DEFAULT_PREFERENCES,
  type Preferences as SavedPreferences,
} from "#/ipc/preferences.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { pageContext } from "#/state/context.ts";
import { mockPageMount } from "#/testing/page.ts";
import { showNotifications } from "#/testing/notifications.ts";
import { settle } from "#/testing/settle.ts";
import { shownSectionTitles } from "#/testing/settings-page.ts";
import SettingsPage from "#/components/settings/SettingsPage.svelte";

describe("InterfaceLanguage", () => {
  let savedPreferences: SavedPreferences;

  /** The section list's button for the section named `name`. */
  const sectionButton = (name: string) =>
    within(screen.getByRole("navigation", { hidden: true })).queryByRole(
      "button",
      { hidden: true, name },
    );

  /** Shows the settings at the Language section, the system's language being `zh-Hant-TW`. */
  async function showLanguageSection(): Promise<HTMLSelectElement> {
    showNotifications();
    mockPageMount(null, {
      preferences: () => savedPreferences,
      save_preferences: (args) => {
        savedPreferences = (args as { preferences: SavedPreferences })
          .preferences;
        return savedPreferences;
      },
      "plugin:os|locale": () => "zh-Hant-TW",
    });
    render(SettingsPage, {
      context: pageContext(new ProjectFeed(), new EditingSession(editingPort)),
      props: {
        project: null,
        isShown: true,
        goBack: () => {},
        pick: async () => null,
        openLicenses: () => {},
      },
    });
    await settle();
    sectionButton("語言")!.click();
    await tick();
    return screen.getByRole<HTMLSelectElement>("combobox", {
      name: "介面語言",
    });
  }

  async function chooseLanguage(
    select: HTMLSelectElement,
    value: string,
  ): Promise<void> {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await tick();
  }

  beforeEach(() => {
    savedPreferences = structuredClone(DEFAULT_PREFERENCES) as SavedPreferences;
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior IF-069
  it("writes the settings in the language chosen without drawing them again", async () => {
    const select = await showLanguageSection();

    await chooseLanguage(select, "en");

    expect([
      sectionButton("Choosing a Segment") !== null,
      select.isConnected,
    ]).toEqual([true, true]);
  });

  // @behavior IF-070
  it("stays at the Language section once a language is chosen", async () => {
    const select = await showLanguageSection();

    await chooseLanguage(select, "en");

    expect(shownSectionTitles(document)).toEqual(["Interface language"]);
  });

  // @behavior IF-071
  it("saves the language chosen with the other Preferences as they were", async () => {
    savedPreferences.choice_landings.text = {
      is_pausing: false,
      is_from_start: false,
    };
    const select = await showLanguageSection();

    await chooseLanguage(select, "en");

    expect([
      savedPreferences.interface_language,
      savedPreferences.choice_landings.text,
    ]).toEqual(["en", { is_pausing: false, is_from_start: false }]);
  });

  // @behavior IF-073
  it("follows the system language again once it is chosen", async () => {
    const select = await showLanguageSection();
    await chooseLanguage(select, "en");

    await chooseLanguage(select, "");

    expect([
      sectionButton("換段") !== null,
      savedPreferences.interface_language,
    ]).toEqual([true, null]);
  });

  // @behavior IF-074
  it("names each language in its own words", async () => {
    const select = await showLanguageSection();
    await chooseLanguage(select, "en");

    const names = [...select.options].slice(1).map(({ text }) => text);

    expect(names).toEqual(["English", "繁體中文"]);
  });
});
