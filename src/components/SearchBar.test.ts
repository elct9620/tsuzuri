// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assemble } from "#/assembly.ts";
import type { ProjectView } from "#/ipc/project.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { projectOf } from "#/testing/project.ts";
import { pageContext, withSegmentFields } from "#/state/context.ts";
import SearchBar from "#/components/SearchBar.svelte";
import { drawSegmentRows, segmentRows } from "#/testing/segment-rows.ts";

describe("SearchBar", () => {
  let project: ProjectView | null;
  let highlights: Map<string, { ranges: Range[] }>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const patternBox = () =>
    screen.queryByRole<HTMLInputElement>("searchbox", { name: "搜尋文字" });
  const isOpen = () => patternBox() !== null;
  const count = () => screen.getByRole("status").textContent;

  const commaProject = projectOf({
    segments: [
      { start_ms: 0, end_ms: 1000, text: "你好，世界" },
      { start_ms: 1000, end_ms: 2000, text: "再見" },
      { start_ms: 2000, end_ms: 3000, text: "好，走吧" },
    ],
  });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  /** Where `pattern` stands in each Segment's text, as Rust answers, counted in characters. */
  function matchesIn(pattern: string) {
    return (project?.segments ?? []).flatMap((segment, index) => {
      const characters = [...segment.text];
      const matches = [];
      for (let at = 0; at < characters.length; at++)
        if (characters.slice(at, at + 1).join("") === pattern)
          matches.push({ index, start: at, end: at + 1 });
      return matches;
    });
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
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
    document.body.innerHTML = `
      <section>
      </section>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "find_text") {
          const { search } = args as {
            search: { pattern: string; is_regex: boolean };
          };
          if (search.is_regex && search.pattern === "(")
            return Promise.reject({
              code: "invalid-pattern",
              detail: "unclosed group",
            });
          return matchesIn(search.pattern);
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    const context = pageContext(assembly.feed, assembly.session);
    const { rows } = drawSegmentRows(
      document.querySelector("section")!,
      context,
    );
    render(SearchBar, {
      context: withSegmentFields(context, {
        field: (index, kind) => rows.field(index, kind),
      }),
    });
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
    });
  });

  function press(init: KeyboardEventInit, on: EventTarget = window): void {
    on.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }

  /** Enters the first Segment's text and selects its characters `start` to `end`. */
  function selectText(start: number, end: number): HTMLElement {
    const text = document.querySelector<HTMLElement>(".field.text")!;
    text.dispatchEvent(new FocusEvent("focus"));
    flushSync();
    const range = document.createRange();
    range.setStart(text.firstChild!, start);
    range.setEnd(text.firstChild!, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return text;
  }

  /** Types `pattern` into the open bar, as the user does. */
  async function type(pattern: string): Promise<void> {
    patternBox()!.value = pattern;
    patternBox()!.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
  }

  /** Opens the bar by the platform's shortcut and finds `pattern`. */
  async function openFinding(pattern: string): Promise<void> {
    const isMac =
      (window as { __TAURI_OS_PLUGIN_INTERNALS__?: { platform: string } })
        .__TAURI_OS_PLUGIN_INTERNALS__?.platform === "macos";
    press({ key: "f", code: "KeyF", ctrlKey: !isMac, metaKey: isMac });
    await type(pattern);
  }

  function markedTexts(name: string): string[] | undefined {
    return highlights.get(name)?.ranges.map(String);
  }

  function currentRow(): number {
    return segmentRows().findIndex((row) => row.hasAttribute("aria-current"));
  }

  // @behavior ED-138
  it("opens by shortcut to find the text the Cursor selects, marking every match", async () => {
    await hold(commaProject);
    const text = selectText(2, 3);

    press({ key: "f", code: "KeyF", ctrlKey: true }, text);
    await settle();

    expect([
      patternBox()?.value,
      document.activeElement === patternBox(),
      markedTexts("search-match"),
      count(),
    ]).toEqual(["，", true, ["，", "，"], "1/2"]);
  });

  // @behavior ED-184
  it("stays closed without a Project, leaving the key to the page", () => {
    const event = new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect([isOpen(), event.defaultPrevented]).toEqual([false, false]);
  });

  // @behavior ED-138
  it("opens by ⌘F on macOS, leaving Ctrl+F to the text", async () => {
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
    });
    await hold(commaProject);

    press({ key: "f", code: "KeyF", ctrlKey: true });
    const isOpenByCtrlF = isOpen();
    press({ key: "f", code: "KeyF", metaKey: true });

    expect([isOpenByCtrlF, isOpen()]).toEqual([false, true]);
  });

  // @behavior ED-138
  it("opens by the place of F, whatever the key there types", async () => {
    await hold(commaProject);

    press({ key: "f", code: "KeyU", ctrlKey: true });
    const isOpenByTypedF = isOpen();
    press({ key: "ㄑ", code: "KeyF", ctrlKey: true });

    expect([isOpenByTypedF, isOpen()]).toEqual([false, true]);
  });

  // @behavior ED-138
  it.each([{ shiftKey: true }, { altKey: true }, { metaKey: true }])(
    "leaves Ctrl+F with %o alone",
    async (modifier) => {
      await hold(commaProject);

      press({ key: "f", code: "KeyF", ctrlKey: true, ...modifier });

      expect(isOpen()).toBe(false);
    },
  );

  // @behavior ED-139
  it("moves to the next match, making its Segment current", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Enter" }, patternBox()!);
    await settle();
    const matchByEnter = [count(), currentRow()];
    press({ key: "F3" });
    await settle();

    expect([matchByEnter, count(), currentRow()]).toEqual([
      ["2/2", 2],
      "1/2",
      0,
    ]);
  });

  // @behavior ED-139
  it("moves to the next match by ⌘G on macOS", async () => {
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
    });
    await hold(commaProject);
    await openFinding("，");

    press({ key: "g", code: "KeyG", metaKey: true });
    await settle();

    expect(count()).toBe("2/2");
  });

  // @behavior ED-140
  it("goes round from the last match to the first", async () => {
    await hold(commaProject);
    await openFinding("，");
    press({ key: "Enter" }, patternBox()!);

    press({ key: "Enter" }, patternBox()!);
    await settle();

    expect([count(), markedTexts("search-current")]).toEqual(["1/2", ["，"]]);
  });

  // @behavior ED-141
  it("moves to the previous match", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Enter", shiftKey: true }, patternBox()!);
    await settle();
    const countByShiftEnter = count();
    press({ key: "F3", shiftKey: true });
    await settle();

    expect([countByShiftEnter, count()]).toEqual(["2/2", "1/2"]);
  });

  // @behavior ED-141
  it("moves to the previous match by ⇧⌘G on macOS, leaving F3 to the system", async () => {
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
    });
    await hold(commaProject);
    await openFinding("，");

    press({ key: "F3" });
    await settle();
    const countAfterF3 = count();
    press({ key: "G", code: "KeyG", metaKey: true, shiftKey: true });
    await settle();

    expect([countAfterF3, count()]).toEqual(["1/2", "2/2"]);
  });

  // @behavior ED-139
  it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }])(
    "moves nowhere by F3 with %o",
    async (modifier) => {
      await hold(commaProject);
      await openFinding("，");

      press({ key: "F3", ...modifier });
      await settle();

      expect(count()).toBe("1/2");
    },
  );

  // @behavior ED-139
  it("moves nowhere by F3 while the bar is closed", async () => {
    await hold(commaProject);

    press({ key: "F3" });
    await settle();

    expect([isOpen(), currentRow()]).toEqual([false, -1]);
  });

  // @behavior ED-143
  it("closes with Esc, leaving nothing marked", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Escape" }, patternBox()!);
    await settle();

    expect([isOpen(), markedTexts("search-match")]).toEqual([false, undefined]);
  });

  // @behavior ED-144
  it("says a regular expression cannot be read, marking nothing", async () => {
    await hold(commaProject);
    await openFinding("，");
    const regexToggle = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "正規表示式",
    });
    regexToggle.checked = true;
    regexToggle.dispatchEvent(new Event("change", { bubbles: true }));

    await type("(");

    expect([markedTexts("search-match"), count()]).toEqual([
      undefined,
      expect.stringContaining("unclosed group"),
    ]);
  });
});
