// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import HelpButton from "#/components/settings/HelpButton.svelte";
import { interfaceLanguageCode, setInterfaceLanguage, t } from "#/i18n.ts";
import { drawPage } from "#/page.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";

describe("interface language", () => {
  afterEach(() => {
    clearMocks();
  });

  /** Starts the interface with the system's `locale`, answering how it names the settings. */
  async function startWith(locale: string | null): Promise<string> {
    await setInterfaceLanguage(locale);
    return t("toolbar.settings");
  }

  // @behavior IF-001
  it("writes the interface in the system's Traditional Chinese", async () => {
    const text = await startWith("zh-Hant-TW");

    expect([text, document.documentElement.lang]).toEqual(["設定", "zh-Hant"]);
  });

  // @behavior IF-002
  it("reads a Taiwan locale without a script as Traditional Chinese", async () => {
    expect(await startWith("zh-TW")).toBe("設定");
  });

  // @behavior IF-003
  it.each(["zh-CN", "ja-JP", null])(
    "falls back to English for %s",
    async (locale) => {
      expect(await startWith(locale)).toBe("Settings");
    },
  );

  // @behavior IF-004
  it("stands for zh-TW when written in Traditional Chinese", async () => {
    await startWith("zh-TW");

    expect(interfaceLanguageCode()).toBe("zh-TW");
  });

  // @behavior IF-005
  it("stands for en when written in any other language", async () => {
    await startWith("ja-JP");

    expect(interfaceLanguageCode()).toBe("en");
  });

  // @behavior IF-012
  it("writes a tooltip in the interface language", async () => {
    await setInterfaceLanguage("zh-TW");

    render(HelpButton, { props: { tip: "settings.primaryLanguageHelp" } });

    expect(screen.getByRole("button").dataset.tooltip).toMatch(
      /^影音裡說的語言/,
    );
  });

  // @behavior IF-013
  it.each(["zh-TW", "en"])("explains every setting in %s", async (locale) => {
    const settings = document.createElement("div");
    await setInterfaceLanguage(locale);
    mockPageMount(projectOf());
    const feed = new ProjectFeed();
    await feed.refresh();

    drawPage(feed, new EditingSession(editingPort), settings);
    await tick();

    const settingsPage = settings.querySelector(
      `[role="region"][aria-label="${t("toolbar.settings")}"]`,
    );
    const rows = [...(settingsPage?.querySelectorAll(".list-row") ?? [])];
    const rowsWithoutHelp = rows.filter((row) => {
      const help = within(row as HTMLElement).queryByRole("button", {
        hidden: true,
        name: (name, button) =>
          name === (button as HTMLElement).dataset.tooltip,
      });
      // i18next answers a key it has no text for with the key itself.
      return !help || /^[a-z]+\.[\w.]+$/i.test(help.dataset.tooltip ?? "");
    });
    expect([rows.length > 0, rowsWithoutHelp.length]).toEqual([true, 0]);
  });

  // @behavior IF-054
  it("names every button in the Interface Language", async () => {
    // In the document, so a name given by `aria-labelledby` finds the element it names
    const page = document.createElement("div");
    document.body.append(page);
    await setInterfaceLanguage("zh-TW");
    mockPageMount(projectOf());

    drawPage(new ProjectFeed(), new EditingSession(editingPort), page);
    await tick();

    // i18next answers a key it has no text for with the key itself
    const unnamedButtons = within(page)
      .queryAllByRole("button", {
        hidden: true,
        name: (name) => name.trim() === "" || /^[a-z]+\.[\w.]+$/i.test(name),
      })
      .map((button) => button.outerHTML.slice(0, 80));
    page.remove();
    expect(unnamedButtons).toEqual([]);
  });
});
