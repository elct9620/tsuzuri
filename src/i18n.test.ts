// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { setInterfaceLanguage, translatePage } from "./i18n";

describe("interface language", () => {
  async function startWith(locale: string | null): Promise<string> {
    document.body.innerHTML = `<button data-i18n="tabs.settings"></button>`;
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
});
