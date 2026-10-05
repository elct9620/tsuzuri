// @vitest-environment happy-dom
import { within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "./backend/editing";
import { ProjectFeed } from "./backend/project";
import { EditingSession } from "./editor";
import {
  interfaceLanguageCode,
  setInterfaceLanguage,
  t,
  translatePage,
} from "./i18n";
import { drawPage } from "./page";
import { mockPageMount } from "./test_page";
import { projectOf } from "./test_project";

describe("interface language", () => {
  afterEach(() => {
    clearMocks();
  });

  async function startWith(locale: string | null): Promise<string> {
    document.body.innerHTML = `<button data-i18n="toolbar.settings"></button>`;
    await setInterfaceLanguage(locale);
    translatePage();
    return document.querySelector("button")!.textContent!;
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
    document.body.innerHTML = `<span data-i18n-tooltip="settings.primaryLanguageHelp"></span>`;
    await setInterfaceLanguage("zh-TW");

    translatePage();

    expect(document.querySelector("span")!.dataset.tooltip).toMatch(
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

    const settingsDialog = [...settings.querySelectorAll("dialog")].find(
      (dialog) =>
        dialog.querySelector("h3")?.textContent === t("toolbar.settings"),
    );
    const rows = [...(settingsDialog?.querySelectorAll(".list-row") ?? [])];
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
});
