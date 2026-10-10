// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { DEFAULT_PREFERENCES, interfaceLocale } from "#/ipc/preferences.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import HelpButton from "#/components/settings/HelpButton.svelte";
import { interfaceLanguageCode, setInterfaceLanguage, t } from "#/i18n.ts";
import { drawPage } from "#/page.ts";
import { notificationStack } from "#/state/notification.svelte.ts";
import en from "#/locales/en.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";

describe("interface language", () => {
  /** Whether `text` is a message key, which i18next answers with when it has no text for it. */
  const isMessageKey = (text: string) =>
    new RegExp(`^(${Object.keys(en).join("|")})\\.[\\w.]+$`).test(text.trim());

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

  // @behavior IF-072
  it("starts in the language chosen over the system's", async () => {
    mockIPC((command) => {
      if (command === "preferences")
        return { ...DEFAULT_PREFERENCES, interface_language: "en" };
      if (command === "plugin:os|locale") return "zh-Hant-TW";
    });

    expect(await startWith(await interfaceLocale())).toBe("Settings");
  });

  // @behavior IF-075
  it("counts one in the singular in English", async () => {
    await startWith("en");

    expect(t("resources.glossary", { count: 1 })).toBe("Glossary: 1 term");
  });

  // @behavior IF-076
  it("counts one as any other number in Traditional Chinese", async () => {
    await startWith("zh-TW");

    expect(t("resources.glossary", { count: 1 })).toBe("詞彙表 1 筆");
  });

  // @behavior IF-077
  it("capitalises a Segment in every English text", () => {
    /** Every text under `texts`, however deep it is nested. */
    const allTexts = (texts: object): string[] =>
      Object.values(texts).flatMap((text) =>
        typeof text === "string" ? [text] : allTexts(text),
      );

    expect(allTexts(en).filter((text) => /\bsegments?\b/.test(text))).toEqual(
      [],
    );
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
    // A setting is a list row, or a table row its header cell names; a table row with no header
    // only explains the row above it.
    const rows = [
      ...(settingsPage?.querySelectorAll(".list-row, tbody > tr") ?? []),
    ].filter(
      (row) =>
        !(row instanceof HTMLTableRowElement) || row.cells[0]?.tagName === "TH",
    );
    const isExplained = (text: string | null | undefined) =>
      !!text?.trim() && !isMessageKey(text);
    const rowsWithoutHelp = rows.filter((row) => {
      const help = within(row as HTMLElement).queryByRole("button", {
        hidden: true,
        name: (name, button) =>
          name === (button as HTMLElement).dataset.tooltip,
      });
      // A line beneath the name explains the row when its controls are described by it.
      const describedBy = row.querySelector("[aria-describedby]");
      const line = describedBy
        ? row.querySelector(
            `[id="${describedBy.getAttribute("aria-describedby")}"]`,
          )
        : null;
      return (
        !isExplained(help?.dataset.tooltip) && !isExplained(line?.textContent)
      );
    });
    expect([rows.length > 0, rowsWithoutHelp.length]).toEqual([true, 0]);
  });

  /** Every text and label drawn under `root`, each with the element it is on. */
  function writtenTexts(root: Element): { element: Element; text: string }[] {
    const texts: { element: Element; text: string }[] = [];
    for (const element of [root, ...root.querySelectorAll("*")]) {
      if (element.tagName === "STYLE" || element.tagName === "SCRIPT") continue;
      for (const node of element.childNodes)
        if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim())
          texts.push({
            element,
            text: node.textContent!.trim(),
          });
      for (const name of [
        "aria-label",
        "title",
        "placeholder",
        "data-tooltip",
      ]) {
        const label = element.getAttribute(name);
        if (label?.trim())
          texts.push({
            element,
            text: label.trim(),
          });
      }
    }
    return texts;
  }

  /**
   * Draws the whole page in `locale` with an English Project open, in the document, so a name
   * given by `aria-labelledby` finds the element it names.
   */
  async function drawWholePage(locale: string): Promise<HTMLElement> {
    const page = document.createElement("div");
    document.body.append(page);
    await setInterfaceLanguage(locale);
    // Notifications earlier tests left were written in their own language
    notificationStack.clear();
    mockPageMount(projectOf({ name: "lecture", language: "en" }));
    const feed = new ProjectFeed();
    await feed.refresh();
    drawPage(feed, new EditingSession(editingPort), page);
    await tick();
    return page;
  }

  // @behavior IF-078
  it("writes no message key on an English page", async () => {
    const page = await drawWholePage("en");

    const keys = writtenTexts(page).filter(({ text }) => isMessageKey(text));
    page.remove();
    expect(keys.map(({ text }) => text)).toEqual([]);
  });

  // @behavior IF-079
  it("writes no Chinese on an English page", async () => {
    const page = await drawWholePage("en");

    // A language named in its own words declares that language
    const chinese = writtenTexts(page).filter(
      ({ element, text }) =>
        /\p{Script=Han}/u.test(text) &&
        !element.closest("[lang]:not([lang^=en])"),
    );
    page.remove();
    expect(chinese.map(({ text }) => text)).toEqual([]);
  });

  // @behavior IF-054
  it("names every button in the Interface Language", async () => {
    const page = await drawWholePage("zh-TW");

    const unnamedButtons = within(page)
      .queryAllByRole("button", {
        hidden: true,
        name: (name) => name.trim() === "" || isMessageKey(name),
      })
      .map((button) => button.outerHTML.slice(0, 80));
    page.remove();
    expect(unnamedButtons).toEqual([]);
  });
});
