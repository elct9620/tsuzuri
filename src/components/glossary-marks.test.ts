// @vitest-environment happy-dom
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assemble } from "#/assembly.ts";
import type { GlossaryRow, GlossaryTable, ProjectView } from "#/ipc/project.ts";
import { pageContext, withSegmentDialogs } from "#/state/context.ts";
import { projectOf } from "#/testing/project.ts";
import { drawSegmentRows } from "#/testing/segment-rows.ts";
import { settle } from "#/testing/settle.ts";
import { type MenuItemSent, menuTexts } from "#/testing/system-menu.ts";

describe("Glossary Marks", () => {
  let project: ProjectView;
  let highlights: Map<string, { ranges: Range[] }>;
  /** The items of each menu of the system made, in the order they were made. */
  let menus: MenuItemSent[][];
  /** The rows each save of the Translation Glossary sent. */
  let savedRows: GlossaryRow[][];
  /** Each glossary dialog opened, with the term it was opened at. */
  let openedTerms: unknown[];
  const table: GlossaryTable = {
    languages: ["zh-TW", "en", "ja"],
    rows: [{ words: ["京都", "Kyoto", ""], is_speaker: false }],
    has_source_target_header: false,
  };

  /** The text each range drawn under `name` covers. */
  const marked = (name: string) =>
    highlights.get(name)?.ranges.map(String) ?? [];

  async function show(): Promise<void> {
    await emit("project-changed");
    await settle();
    await settle();
  }

  beforeEach(async () => {
    highlights = new Map();
    vi.stubGlobal("CSS", { highlights });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
    project = projectOf({
      shown_translation: "en",
      segments: [
        {
          start_ms: 0,
          end_ms: 1000,
          text: "小林先生明天要去京都",
          translation: "Kobayashi goes to Kyoto",
        },
      ],
      glossary_marks: [
        {
          text: [
            { start: 0, end: 2, word: "小林", kind: "candidate" },
            { start: 8, end: 10, word: "京都", kind: "term" },
          ],
          translation: [{ start: 18, end: 23, word: "Kyoto", kind: "term" }],
        },
      ],
    });
    menus = [];
    savedRows = [];
    openedTerms = [];
    document.body.innerHTML = `<main></main>`;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "translation_glossary_table") return table;
        if (command === "save_translation_glossary")
          savedRows.push((args as { rows: GlossaryRow[] }).rows);
        if (command === "plugin:menu|new") {
          const { options } = args as { options?: { items?: MenuItemSent[] } };
          if (options?.items) menus.push(options.items);
          return [menus.length, `menu-${menus.length}`];
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    drawSegmentRows(
      document.querySelector("main")!,
      withSegmentDialogs(pageContext(assembly.feed, assembly.session), {
        openRetranslation: () => undefined,
        openRetranscription: () => undefined,
        openShift: () => undefined,
        openSpeakers: () => undefined,
        openGlossary: (term) => openedTerms.push(term),
      }),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior GM-012
  it("underlines the terms and the candidates in their fields", async () => {
    await show();

    expect([marked("glossary-term"), marked("glossary-candidate")]).toEqual([
      ["京都", "Kyoto"],
      ["小林"],
    ]);
  });

  // @behavior GM-013
  it("leaves the marks out of a field typed in since they were found", async () => {
    const field = document.querySelector<HTMLElement>(".field.text")!;
    field.focus();
    field.textContent = "小林先生";

    // Each Project read is a new one, as the Rust side answers it anew
    project = { ...project };
    await show();

    expect(marked("glossary-candidate")).toEqual([]);
  });

  describe("the right-click menu", () => {
    /** Puts the caret of the field of `kind` at `offset`, then right-clicks the field. */
    async function rightClickAt(kind: string, offset: number): Promise<void> {
      const field = document.querySelector<HTMLElement>(`.field.${kind}`)!;
      const text = field.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
      field.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      await settle();
    }

    const lastMenu = () => menus[menus.length - 1];

    /** Picks the item of the last menu reading `text`, as the user does. */
    async function pick(text: string): Promise<void> {
      const item = lastMenu().find((each) => each.text === text)!;
      item.handler!.onmessage(item.id!);
      await settle();
      await settle();
    }

    beforeEach(show);

    // @behavior GM-014
    it("offers to add the candidate the caret stands in", async () => {
      await rightClickAt("text", 1);

      expect(menuTexts(lastMenu())).toContain("加入詞彙表：小林");
    });

    // @behavior GM-015
    it("offers to edit the term the caret stands in", async () => {
      await rightClickAt("text", 9);

      expect(menuTexts(lastMenu())).toContain("在詞彙表中編輯：京都");
    });

    // @behavior GM-016
    it("offers nothing of the glossary where the caret stands in no mark", async () => {
      await rightClickAt("text", 5);

      expect(
        menuTexts(lastMenu()).some((text) => text?.includes("詞彙表")),
      ).toBe(false);
    });

    // @behavior GM-017
    it("writes a candidate added into the Primary Language column", async () => {
      await rightClickAt("text", 1);

      await pick("加入詞彙表：小林");

      expect(savedRows).toEqual([
        [...table.rows, { words: ["小林", "", ""], is_speaker: false }],
      ]);
    });

    // @behavior GM-018
    it("opens the glossary at a candidate once it is added", async () => {
      await rightClickAt("text", 1);

      await pick("加入詞彙表：小林");

      expect(openedTerms).toEqual([{ language: "zh-TW", word: "小林" }]);
    });

    // @behavior GM-019
    it("opens the glossary at a term of the translation in its Language", async () => {
      await rightClickAt("translation", 20);

      await pick("在詞彙表中編輯：Kyoto");

      expect(openedTerms).toEqual([{ language: "en", word: "Kyoto" }]);
    });
  });
});
