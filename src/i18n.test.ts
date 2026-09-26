// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import page from "../index.html?raw";
import {
  interfaceLanguageCode,
  setInterfaceLanguage,
  translatePage,
} from "./i18n";

describe("interface language", () => {
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
    // Only the markup is read, so nothing the page links to is fetched.
    const markup = page.replace(/<link[^>]*>|<script[\s\S]*?<\/script>/g, "");
    const settings = new DOMParser().parseFromString(markup, "text/html");
    await setInterfaceLanguage(locale);

    translatePage(settings);

    const rows = [
      ...settings.querySelectorAll('[data-dialog-target="dialog"] .list-row'),
    ];
    const rowsWithoutTip = rows.filter((row) => {
      const help = row.querySelector<HTMLElement>("[data-i18n-tooltip]");
      return (
        !help?.dataset.tooltip ||
        help.dataset.tooltip === help.dataset.i18nTooltip
      );
    });
    expect([rows.length > 0, rowsWithoutTip.length]).toEqual([true, 0]);
  });
});
