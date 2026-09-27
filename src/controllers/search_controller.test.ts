// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import FieldController, { composingOption } from "./field_controller";
import SearchController from "./search_controller";
import TranscriptController from "./transcript_controller";

describe("SearchController", () => {
  let application: Application;
  let project: ProjectView | null;
  let highlights: Map<string, { ranges: Range[] }>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-search-target="${name}"]`)!;

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
      const found = [];
      for (let at = 0; at < characters.length; at++)
        if (characters.slice(at, at + 1).join("") === pattern)
          found.push({ index, start: at, end: at + 1 });
      return found;
    });
  }

  beforeEach(async () => {
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
      <section data-controller="transcript search"
        data-action="selectionchange@document->transcript#followSelection editor:cursor@window->transcript#showCursor keydown@window->search#openByShortcut keydown@window->search#moveByShortcut transcript:shown->search#follow">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <div data-search-target="bar" hidden>
          <input data-search-target="pattern"
            data-action="input->search#search keydown.enter->search#next:!composing:prevent keydown.shift+enter->search#previous:!composing:prevent keydown.esc->search#close:!composing:prevent" />
          <span data-search-target="count"></span>
          <input type="radio" name="search-field" value="text" data-search-target="field" checked />
          <input type="radio" name="search-field" value="translation" data-search-target="field" />
          <input type="checkbox" data-search-target="regexToggle" />
        </div>
        <ol data-transcript-target="list"></ol>
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
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    await assemble(application, {
      field: FieldController,
      transcript: TranscriptController,
      search: SearchController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
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
    const range = document.createRange();
    range.setStart(text.firstChild!, start);
    range.setEnd(text.firstChild!, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return text;
  }

  /** Opens the bar by the platform's shortcut and finds `pattern`. */
  async function openFinding(pattern: string): Promise<void> {
    const isMac =
      (window as { __TAURI_OS_PLUGIN_INTERNALS__?: { platform: string } })
        .__TAURI_OS_PLUGIN_INTERNALS__?.platform === "macos";
    press({ key: "f", code: "KeyF", ctrlKey: !isMac, metaKey: isMac });
    target<HTMLInputElement>("pattern").value = pattern;
    target("pattern").dispatchEvent(new Event("input"));
    await settle();
  }

  function marked(name: string): string[] | undefined {
    return highlights.get(name)?.ranges.map(String);
  }

  function currentRow(): number {
    return [
      ...document.querySelectorAll("[data-transcript-target='list'] > li"),
    ].findIndex((row) => row.hasAttribute("aria-current"));
  }

  // @behavior ED-138
  it("opens by shortcut to find the text the Cursor selects, marking every match", async () => {
    await hold(commaProject);
    const text = selectText(2, 3);

    press({ key: "f", code: "KeyF", ctrlKey: true }, text);
    await settle();

    expect([
      target("bar").hidden,
      target<HTMLInputElement>("pattern").value,
      document.activeElement === target("pattern"),
      marked("search-match"),
      target("count").textContent,
    ]).toEqual([false, "，", true, ["，", "，"], "1/2"]);
  });

  // @behavior ED-138
  it("opens by ⌘F on macOS, leaving Ctrl+F to the text", async () => {
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
    });
    await hold(commaProject);

    press({ key: "f", code: "KeyF", ctrlKey: true });
    const isOpenByCtrlF = !target("bar").hidden;
    press({ key: "f", code: "KeyF", metaKey: true });

    expect([isOpenByCtrlF, target("bar").hidden]).toEqual([false, false]);
  });

  // @behavior ED-139
  it("moves to the next match, making its Segment current", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Enter" }, target("pattern"));
    const byEnter = [target("count").textContent, currentRow()];
    press({ key: "F3" });

    expect([byEnter, target("count").textContent, currentRow()]).toEqual([
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

    expect(target("count").textContent).toBe("2/2");
  });

  // @behavior ED-140
  it("goes round from the last match to the first", async () => {
    await hold(commaProject);
    await openFinding("，");
    press({ key: "Enter" }, target("pattern"));

    press({ key: "Enter" }, target("pattern"));

    expect([target("count").textContent, marked("search-current")]).toEqual([
      "1/2",
      ["，"],
    ]);
  });

  // @behavior ED-141
  it("moves to the previous match", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Enter", shiftKey: true }, target("pattern"));
    const byShiftEnter = target("count").textContent;
    press({ key: "F3", shiftKey: true });

    expect([byShiftEnter, target("count").textContent]).toEqual(["2/2", "1/2"]);
  });

  // @behavior ED-139
  it("moves nowhere by F3 while the bar is closed", async () => {
    await hold(commaProject);

    press({ key: "F3" });

    expect([target("count").textContent, currentRow()]).toEqual(["", -1]);
  });

  // @behavior ED-142
  it("searches again as the Segments change", async () => {
    await hold(commaProject);
    await openFinding("，");

    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "你好世界" },
          ...commaProject.segments.slice(1),
        ],
      }),
    );
    await settle();

    expect(target("count").textContent).toBe("1/1");
  });

  // @behavior ED-143
  it("closes with Esc, leaving nothing marked", async () => {
    await hold(commaProject);
    await openFinding("，");

    press({ key: "Escape" }, target("pattern"));

    expect([target("bar").hidden, marked("search-match")]).toEqual([
      true,
      undefined,
    ]);
  });

  // @behavior ED-144
  it("says a regular expression cannot be read, marking nothing", async () => {
    await hold(commaProject);
    await openFinding("，");
    target<HTMLInputElement>("regexToggle").checked = true;

    target<HTMLInputElement>("pattern").value = "(";
    target("pattern").dispatchEvent(new Event("input"));
    await settle();

    expect([marked("search-match"), target("count").textContent]).toEqual([
      undefined,
      expect.stringContaining("unclosed group"),
    ]);
  });
});
