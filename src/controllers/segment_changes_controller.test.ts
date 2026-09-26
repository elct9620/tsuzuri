// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import page from "../../index.html?raw";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import { projectOf } from "../test_project";
import { fieldValue } from "../editor";
import FieldController, { composingOption } from "./field_controller";
import SegmentChangesController from "./segment_changes_controller";
import TranscriptController from "./transcript_controller";
import { typingOption } from "./undo_controller";

describe("SegmentChangesController", () => {
  let application: Application;
  let project: ProjectView | null;
  let changes: unknown[];
  let isRefusing: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  function row(index: number): HTMLLIElement {
    return document.querySelectorAll<HTMLLIElement>("ol > li")[index];
  }

  async function choose(index: number, action: string): Promise<void> {
    row(index).querySelector<HTMLButtonElement>(`button.${action}`)!.click();
    await settle();
  }

  async function check(...indexes: number[]): Promise<void> {
    for (const index of indexes) {
      const checkbox =
        row(index).querySelector<HTMLInputElement>("input.check")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await settle();
  }

  const threeSegments = projectOf({
    segments: [
      { start_ms: 0, end_ms: 1000, text: "你好世界" },
      { start_ms: 1000, end_ms: 2000, text: "今天" },
      { start_ms: 2000, end_ms: 3000, text: "天氣很好" },
    ],
  });

  beforeEach(async () => {
    project = null;
    changes = [];
    isRefusing = false;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript segment-changes" data-action="editor:cursor@window->transcript#showCursor editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked keydown.ctrl+a@window->segment-changes#checkAll:!typing:prevent">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <div data-segment-changes-target="checkedBar" hidden>
          <span data-segment-changes-target="checkedCount"></span>
          <button id="merge" data-segment-changes-target="mergeButton" data-action="segment-changes#merge">合併</button>
          <button id="open-shift" data-action="segment-changes#openShift">平移</button>
          <button id="delete-checked" data-action="segment-changes#deleteChecked">刪除</button>
        </div>
        <dialog data-segment-changes-target="shiftDialog">
          <input type="number" data-segment-changes-target="offset" />
          <button id="shift" data-action="segment-changes#shift">平移</button>
        </dialog>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "change_segments") {
          changes.push((args as { change: unknown }).change);
          if (isRefusing) throw { code: "segment", detail: "refused" };
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    application.registerActionOption("typing", typingOption);
    await assemble(application, {
      field: FieldController,
      transcript: TranscriptController,
      "segment-changes": SegmentChangesController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.restoreAllMocks();
  });

  // @behavior ED-014
  it("asks for the times typed for a Segment", async () => {
    await hold(threeSegments);
    const start = row(0).querySelector<HTMLInputElement>("input.start")!;

    start.value = "00:00:00.500";
    start.dispatchEvent(new Event("change"));
    await settle();

    expect(changes).toEqual([
      { kind: "times", index: 0, start_ms: 500, end_ms: 1000 },
    ]);
  });

  // @behavior ED-015
  it("refuses a time that cannot be read", async () => {
    await hold(threeSegments);
    const start = row(0).querySelector<HTMLInputElement>("input.start")!;

    start.value = "abc";
    start.dispatchEvent(new Event("change"));
    await settle();

    expect([changes, notifications()]).toEqual([
      [],
      ["時間要寫成 00:00:01.000 的格式"],
    ]);
  });

  // @behavior ED-016
  it("asks to insert a Segment below the one whose menu was used", async () => {
    await hold(threeSegments);

    await choose(0, "insertAfter");

    expect(changes).toEqual([{ kind: "insertion-after", index: 0 }]);
  });

  /** Enters the first Segment's text and leaves the caret after `你好`. */
  function placeCaret(): HTMLElement {
    const text = row(0).querySelector<HTMLElement>(".field.text")!;
    text.dispatchEvent(new FocusEvent("focus"));
    const caret = document.createRange();
    caret.setStart(text.firstChild!, 2);
    caret.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(caret);
    return text;
  }

  // @behavior ED-017
  it("asks to split a Segment where its cursor was left", async () => {
    await hold(threeSegments);
    const text = placeCaret();

    text.dispatchEvent(new FocusEvent("blur"));
    document.getSelection()!.selectAllChildren(row(0).querySelector("ul")!);
    await choose(0, "split");

    expect(changes).toEqual([{ kind: "split", index: 0, at: 2 }]);
  });

  // @behavior ED-043
  it("asks to split a Segment at its caret by shortcut", async () => {
    await hold(threeSegments);
    const text = placeCaret();

    text.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    await settle();

    expect(changes).toEqual([{ kind: "split", index: 0, at: 2 }]);
  });

  // @behavior ED-018
  it("asks to merge the Checked Segments", async () => {
    await hold(threeSegments);
    await check(0, 1);

    document.querySelector<HTMLButtonElement>("#merge")!.click();
    await settle();

    expect(changes).toEqual([{ kind: "merge", first: 0, last: 1 }]);
  });

  // @behavior ED-019
  it("asks to shift the Checked Segments", async () => {
    await hold(threeSegments);
    await check(1, 2);
    document.querySelector<HTMLButtonElement>("#open-shift")!.click();
    document.querySelector<HTMLInputElement>(
      '[data-segment-changes-target="offset"]',
    )!.value = "500";

    document.querySelector<HTMLButtonElement>("#shift")!.click();
    await settle();

    expect(changes).toEqual([
      { kind: "shift", first: 1, last: 2, offset_ms: 500 },
    ]);
  });

  // @behavior ED-020
  it("offers no merge for Segments apart from each other", async () => {
    await hold(threeSegments);

    await check(0, 2);

    expect(document.querySelector<HTMLButtonElement>("#merge")!.disabled).toBe(
      true,
    );
  });

  // @behavior ED-021
  it("clears the checks once the Segments change", async () => {
    await hold(threeSegments);
    await check(0, 1);

    await choose(2, "delete");
    await hold(projectOf({ segments: threeSegments.segments.slice(0, 2) }));

    expect([
      document.querySelectorAll("input.check:checked").length,
      document.querySelector<HTMLElement>(
        '[data-segment-changes-target="checkedBar"]',
      )!.hidden,
    ]).toEqual([0, true]);
  });

  // @behavior ED-065
  it("asks to delete the Checked Segments as one change", async () => {
    await hold(threeSegments);
    await check(0, 2);

    document.querySelector<HTMLButtonElement>("#delete-checked")!.click();
    await settle();

    expect(changes).toEqual([{ kind: "deletion", indexes: [0, 2] }]);
  });

  describe("checking every Segment", () => {
    const checkedCount = () =>
      document.querySelectorAll("input.check:checked").length;
    const isBarHidden = () =>
      document.querySelector<HTMLElement>(
        '[data-segment-changes-target="checkedBar"]',
      )!.hidden;
    const textOf = (index: number) =>
      row(index).querySelector<HTMLElement>(".field.text")!;

    function pressCtrlA(target: EventTarget): KeyboardEvent {
      const event = new KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    }

    // @behavior ED-066
    it("checks every Segment by Ctrl+A outside a text field", async () => {
      await hold(threeSegments);

      pressCtrlA(document.body);
      await settle();

      expect([checkedCount(), isBarHidden()]).toEqual([3, false]);
    });

    // @behavior ED-067
    it("leaves Ctrl+A in a text field to the field", async () => {
      await hold(threeSegments);

      const event = pressCtrlA(textOf(0));
      await settle();

      expect([checkedCount(), event.defaultPrevented]).toEqual([0, false]);
    });

    // @behavior ED-068
    it("checks every Segment when Select All is chosen from the Edit menu", async () => {
      await hold(threeSegments);

      await emit("edit-command", "select-all");
      await settle();

      expect(checkedCount()).toBe(3);
    });

    // @behavior ED-069
    it("selects a text field's text when Select All is chosen from the Edit menu", async () => {
      await hold(threeSegments);
      const execCommand = vi.fn(() => true);
      document.execCommand = execCommand;
      textOf(0).focus();

      await emit("edit-command", "select-all");
      await settle();

      expect([execCommand.mock.calls, checkedCount()]).toEqual([
        [["selectAll"]],
        0,
      ]);
    });
  });

  describe("checking with Shift", () => {
    const fourSegments = projectOf({
      segments: [
        ...threeSegments.segments,
        { start_ms: 3000, end_ms: 4000, text: "出門" },
      ],
    });
    const checked = () =>
      [...document.querySelectorAll<HTMLInputElement>("input.check")].map(
        (check) => check.checked,
      );
    const current = () =>
      [...document.querySelectorAll("ol > li")].findIndex((li) =>
        li.hasAttribute("aria-current"),
      );

    /** Clicks the text of row `index` with Shift held; the text takes focus unless the press is prevented, as in a browser. */
    async function shiftClick(index: number): Promise<void> {
      const text = row(index).querySelector<HTMLElement>(".field.text")!;
      const options = { bubbles: true, cancelable: true, shiftKey: true };
      if (text.dispatchEvent(new MouseEvent("mousedown", options)))
        text.focus();
      text.dispatchEvent(new MouseEvent("click", options));
      await settle();
    }

    // @behavior ED-071
    it("checks the Segments from the Current Segment through a row clicked with Shift", async () => {
      await hold(fourSegments);
      row(1).click();
      await check(3);

      await shiftClick(2);

      expect([checked(), current()]).toEqual([[false, true, true, false], 1]);
    });

    // @behavior ED-071
    it("resizes the run as another row is clicked with Shift", async () => {
      await hold(fourSegments);
      row(1).click();
      await shiftClick(3);

      await shiftClick(2);

      expect(checked()).toEqual([false, true, true, false]);
    });

    // @behavior ED-072
    it("checks upward from the Current Segment", async () => {
      await hold(threeSegments);
      row(2).click();

      await shiftClick(0);

      expect(checked()).toEqual([true, true, true]);
    });

    // @behavior ED-071
    it("leaves the check of a row clicked with Shift as the run makes it", async () => {
      await hold(threeSegments);
      row(0).click();
      const box = row(1).querySelector<HTMLInputElement>("input.check")!;

      const isToggled = box.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          shiftKey: true,
        }),
      );
      const isClicked = box.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          shiftKey: true,
        }),
      );
      await settle();

      expect([isToggled, isClicked, checked()]).toEqual([
        false,
        false,
        [true, true, false],
      ]);
    });

    // @behavior ED-073
    it("makes a row clicked with Shift current when no Segment is", async () => {
      await hold(threeSegments);

      await shiftClick(1);

      expect([checked(), current()]).toEqual([[false, false, false], 1]);
    });
  });

  describe("the Cursor", () => {
    const texts = (...values: string[]) =>
      projectOf({
        segments: values.map((text, index) => ({
          start_ms: index * 1000,
          end_ms: (index + 1) * 1000,
          text,
        })),
      });
    const field = (index: number, kind = "text") =>
      row(index).querySelector<HTMLElement>(`.field.${kind}`)!;
    const current = () =>
      [...document.querySelectorAll("ol > li")].findIndex((li) =>
        li.hasAttribute("aria-current"),
      );
    const caretMark = (index: number) =>
      row(index).querySelector<HTMLElement>(".cursor-caret");

    /** Places the caret `at` characters into the text of Segment `index`, then gives the text focus, as a click there does. */
    async function enter(index: number, at: number, end = at): Promise<void> {
      const text = field(index);
      const range = document.createRange();
      range.setStart(text.firstChild!, at);
      range.setEnd(text.firstChild!, end);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      text.focus();
      await settle();
    }

    /** Moves focus from the text of Segment `index` to the menu of Segment `menu`, as opening that menu does. */
    async function openMenu(index: number, menu = index): Promise<void> {
      field(index).blur();
      const opener = row(menu).querySelector<HTMLElement>(
        '[role="button"][aria-label]',
      )!;
      opener.focus();
      document.getSelection()!.removeAllRanges();
      await settle();
    }

    // @behavior ED-042
    it("keeps the Cursor where it was left once focus moves to the menu", async () => {
      await hold(threeSegments);
      await enter(0, 2);

      await openMenu(0);

      expect([
        field(0).dataset.cursor,
        field(0).hasAttribute("data-has-kept-cursor"),
      ]).toEqual(["2", true]);
    });

    // @behavior ED-044
    it("drops a kept Cursor once the Project replaces its text", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0);

      await hold(texts("今天天氣很好", "今天", "天氣很好"));

      expect([current(), field(0).dataset.cursor]).toEqual([0, undefined]);
    });

    // @behavior ED-045
    it("makes a Segment current as its text gets focus", async () => {
      await hold(threeSegments);
      row(0).click();

      await enter(1, 1);

      expect([current(), field(1).dataset.cursor]).toEqual([1, "1"]);
    });

    // @behavior ED-061
    it("makes a Segment current without a Cursor as its time gets focus", async () => {
      await hold(threeSegments);
      await enter(0, 2);

      row(1).querySelector<HTMLInputElement>("input.start")!.focus();
      await settle();

      expect([
        current(),
        field(0).dataset.cursor,
        field(1).dataset.cursor,
      ]).toEqual([1, undefined, undefined]);
    });

    // @behavior ED-048
    it("asks for a Cursor when another Segment's menu splits", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0, 1);

      await choose(1, "split");

      expect([changes, notifications(), current()]).toEqual([
        [],
        ["先把游標放在文字中要切割的位置"],
        1,
      ]);
    });

    // @behavior ED-049
    it("draws its own caret, which the page leaves the platform's to hide", async () => {
      await hold(threeSegments);

      await enter(0, 2);

      const list = new DOMParser()
        .parseFromString(page, "text/html")
        .querySelector('[data-transcript-target="list"]')!.className;
      expect([
        field(0).dataset.cursor,
        caretMark(0)?.classList.contains("animate-blink"),
        list.includes("[&_.field]:caret-transparent"),
        list.includes("[&_.field]:selection:bg-transparent"),
      ]).toEqual(["2", true, true, true]);
    });

    // @behavior ED-050
    it("holds a kept caret still", async () => {
      await hold(threeSegments);
      await enter(0, 2);

      await openMenu(0);

      expect([
        field(0).dataset.cursor,
        caretMark(0)?.classList.contains("animate-blink"),
      ]).toEqual(["2", false]);
    });

    // @behavior ED-051
    it("marks a range of text without a caret", async () => {
      await hold(threeSegments);

      await enter(0, 1, 3);

      expect([field(0).dataset.cursor, caretMark(0)]).toEqual(["1-3", null]);
    });

    // @behavior ED-052
    it("leaves no Current Segment once another Resource is shown", async () => {
      await hold(threeSegments);
      await enter(0, 2);

      await hold({ ...threeSegments, current_resource: "ep02" });

      expect([current(), field(0).dataset.cursor]).toEqual([-1, undefined]);
    });

    // @behavior ED-053
    it("moves to the start of the second half after a split", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0);

      await choose(0, "split");
      await hold(texts("你好", "世界", "今天", "天氣很好"));

      expect([
        current(),
        document.activeElement === field(1),
        field(1).dataset.cursor,
      ]).toEqual([1, true, "0"]);
    });

    // @behavior ED-054
    it("keeps the Cursor when a split is refused", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0);
      isRefusing = true;

      await choose(0, "split");
      await hold(threeSegments);

      expect([current(), field(0).dataset.cursor]).toEqual([0, "2"]);
    });

    // @behavior ED-055
    it("moves into a Segment inserted from a menu", async () => {
      await hold(threeSegments);
      row(0).click();

      await choose(0, "insertAfter");
      await hold(texts("你好世界", "", "今天", "天氣很好"));

      expect([
        current(),
        document.activeElement === field(1),
        field(1).dataset.cursor,
      ]).toEqual([1, true, "0"]);
    });

    // @behavior ED-057
    it("moves to the next Segment when the current one is deleted", async () => {
      await hold(threeSegments);

      await choose(1, "delete");
      await hold(texts("你好世界", "天氣很好"));

      expect(current()).toBe(1);
    });

    // @behavior ED-058
    it("moves to the previous Segment when the last one is deleted", async () => {
      await hold(threeSegments);

      await choose(2, "delete");
      await hold(texts("你好世界", "今天"));

      expect(current()).toBe(1);
    });

    // @behavior ED-070
    it("moves past every Segment deleted", async () => {
      await hold(texts("一", "二", "三", "四"));
      await check(1, 2);
      row(1).click();

      document.querySelector<HTMLButtonElement>("#delete-checked")!.click();
      await settle();
      await hold(texts("一", "四"));

      expect([current(), fieldValue(field(1))]).toEqual([1, "四"]);
    });

    // @behavior ED-059
    it("keeps the merged Segment current", async () => {
      await hold(threeSegments);
      await check(1, 2);
      row(2).click();

      document.querySelector<HTMLButtonElement>("#merge")!.click();
      await settle();
      await hold(texts("你好世界", "今天天氣很好"));

      expect(current()).toBe(1);
    });

    // @behavior ED-063
    it("keeps the Current Segment on its Segment when others before it are merged", async () => {
      await hold(texts("一", "二", "三", "四"));
      await check(0, 1);
      row(3).click();

      document.querySelector<HTMLButtonElement>("#merge")!.click();
      await settle();
      await hold(texts("一二", "三", "四"));

      expect([current(), fieldValue(field(2))]).toEqual([2, "四"]);
    });

    // @behavior ED-060
    it("leaves no Current Segment when the Segments change in number elsewhere", async () => {
      await hold(threeSegments);
      row(1).click();

      await hold(texts("你好世界", "今天", "天氣很好", "明天"));

      expect(current()).toBe(-1);
    });

    // @behavior ED-064
    it("keeps the Current Segment when the Segments change elsewhere but not in number", async () => {
      await hold(threeSegments);
      row(1).click();

      await hold(texts("你好", "今天", "天氣很好"));

      expect(current()).toBe(1);
    });

    // @behavior ED-062
    it("drops the Cursor when a Mode holds its text", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0);

      await hold({ ...threeSegments, running_mode: { mode: "transcription" } });

      expect([current(), field(0).dataset.cursor]).toEqual([0, undefined]);
    });
  });
});
