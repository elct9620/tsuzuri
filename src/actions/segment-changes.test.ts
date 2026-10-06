// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "#/assembly.ts";
import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import {
  showNotifications,
  notificationCountdown,
  notificationDetail,
  notifications,
} from "#/testing/notifications.ts";
import { drawPage } from "#/page.ts";
import { mockPageMount } from "#/testing/page.ts";
import { projectOf } from "#/testing/project.ts";
import { EditingSession, fieldValue } from "#/editor/index.ts";
import { pageContext, withSegmentDialogs } from "#/state/context.ts";
import { Playback } from "#/state/playback.svelte.ts";
import { ViewChoices } from "#/state/view-choices.svelte.ts";
import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
import SegmentList from "#/components/SegmentList.svelte";
import { renderFollowingProject } from "#/testing/following-project.ts";
import { usePlatform } from "#/testing/platform.ts";
import { settle } from "#/testing/settle.ts";

/** A menu item as the webview hands it to Rust: a predefined one, or one of its own with a handler. */
interface MenuItemSent {
  item?: string;
  id?: string;
  text?: string;
  enabled?: boolean;
  accelerator?: string;
  handler?: { onmessage: (id: string) => void };
}

describe("Segment Changes", () => {
  let project: ProjectView | null;
  let changes: unknown[];
  /** The names of the edit and change commands sent, in the order they were sent. */
  let sentCommands: string[];
  /** What the Project answers each Segment Change with, or none to make it. */
  let refusal: unknown;
  /** The items of each menu of the system made, in the order they were made. */
  let menus: MenuItemSent[][];
  let popupCount: number;
  /** Each dialog a choice opened, with what it was opened for. */
  let openedDialogs: unknown[][];
  let session: EditingSession;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  function row(index: number): HTMLLIElement {
    return document.querySelectorAll<HTMLLIElement>("ol > li")[index];
  }

  /** The checked bar's button named `name`, drawn only while Segments are checked. */
  const barButton = (name: string) =>
    screen.queryByRole<HTMLButtonElement>("button", { name });

  /** Whether the checked bar shows. */
  const isBarShown = () => screen.queryByText(/^已勾選 \d+ 段$/) !== null;

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
    sentCommands = [];
    refusal = null;
    menus = [];
    popupCount = 0;
    openedDialogs = [];
    document.body.innerHTML = `
      <select aria-label="譯文"></select>
      <section></section>
      <dialog><button>平移</button></dialog>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "plugin:menu|new") {
          const { options } = args as { options?: { items?: MenuItemSent[] } };
          if (options?.items) menus.push(options.items);
          return [menus.length, `menu-${menus.length}`];
        }
        if (command === "plugin:menu|popup") popupCount++;
        if (command === "edit_segment" || command === "change_segments")
          sentCommands.push(command);
        if (command === "change_segments") {
          changes.push((args as { change: unknown }).change);
          if (refusal) throw refusal;
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    session = assembly.session;
    renderFollowingProject(SegmentList, assembly.feed, {
      target: document.querySelector("section")!,
      props: {
        playback: new Playback(),
        placeholders: new ResourcePlaceholders(),
        viewChoices: new ViewChoices(),
      },
      context: withSegmentDialogs(
        pageContext(assembly.feed, assembly.session),
        {
          openRetranslation: (indexes) =>
            openedDialogs.push(["retranslation", indexes]),
          openRetranscription: (scope) =>
            openedDialogs.push(["retranscription", scope]),
          openShift: () => openedDialogs.push(["shift"]),
          openSpeakers: (indexes) => openedDialogs.push(["speakers", indexes]),
        },
      ),
    });
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
    vi.restoreAllMocks();
  });

  // @behavior ED-014
  it("asks for the times typed for a Segment", async () => {
    await hold(threeSegments);
    const start = row(0).querySelector<HTMLInputElement>("input.start")!;

    start.value = "00:00:00.500";
    start.dispatchEvent(new Event("change", { bubbles: true }));
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
    start.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect([
      changes,
      start.value,
      notifications(),
      notificationCountdown(0) !== null,
    ]).toEqual([[], "00:00:00.000", ["時間要寫成 00:00:01.000 的格式"], true]);
  });

  // @behavior ED-109
  it("carries a part of a time past its range into the part above", async () => {
    await hold(threeSegments);
    const end = row(0).querySelector<HTMLInputElement>("input.end")!;

    end.value = "00:00:75.000";
    end.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(changes).toEqual([
      { kind: "times", index: 0, start_ms: 0, end_ms: 75_000 },
    ]);
  });

  // @behavior ED-145
  it("holds a time within the longest one written", async () => {
    await hold(threeSegments);
    const end = row(0).querySelector<HTMLInputElement>("input.end")!;

    end.value = "99:99:99.999";
    end.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(changes).toEqual([
      { kind: "times", index: 0, start_ms: 0, end_ms: 359_999_999 },
    ]);
  });

  // @behavior ED-112
  it("pushes the end past a typed start", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 1000, end_ms: 2000, text: "一" }] }),
    );
    const start = row(0).querySelector<HTMLInputElement>("input.start")!;

    start.value = "00:00:03.000";
    start.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(changes).toEqual([
      { kind: "times", index: 0, start_ms: 3000, end_ms: 3000 },
    ]);
  });

  // @behavior ED-154
  it("pulls the start back before a typed end", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 1000, end_ms: 2000, text: "一" }] }),
    );
    const end = row(0).querySelector<HTMLInputElement>("input.end")!;

    end.value = "00:00:00.500";
    end.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(changes).toEqual([
      { kind: "times", index: 0, start_ms: 500, end_ms: 500 },
    ]);
  });

  // @behavior ED-097
  it("says why a typed start before the previous Segment's start is refused", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 1000, end_ms: 2000, text: "一" },
          { start_ms: 3000, end_ms: 4000, text: "二" },
        ],
      }),
    );
    refusal = { code: "unordered-times" };
    const start = row(1).querySelector<HTMLInputElement>("input.start")!;

    start.value = "00:00:00.500";
    start.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(notificationDetail(0)).toBe(
      "開始時間不能早於前一段的開始，也不能晚於後一段的開始",
    );
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
    flushSync();
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

  // @behavior ED-192
  it("leaves the other platform's split shortcut alone", async () => {
    await hold(threeSegments);
    const text = placeCaret();

    text.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    await settle();

    expect(changes).toEqual([]);
  });

  // @behavior ED-018
  it("asks to merge the Checked Segments", async () => {
    await hold(threeSegments);
    await check(0, 1);

    barButton("合併")!.click();
    await settle();

    expect(changes).toEqual([{ kind: "merge", first: 0, last: 1 }]);
  });

  // @behavior ED-020
  it("offers no merge for Segments apart from each other", async () => {
    await hold(threeSegments);

    await check(0, 2);

    expect(barButton("合併")?.disabled).toBe(true);
  });

  // @behavior ED-021
  it("clears the checks once the Segments change", async () => {
    await hold(threeSegments);
    await check(0, 1);

    await choose(2, "delete");
    await hold(projectOf({ segments: threeSegments.segments.slice(0, 2) }));

    expect([
      document.querySelectorAll("input.check:checked").length,
      isBarShown(),
    ]).toEqual([0, false]);
  });

  // @behavior ED-065
  it("asks to delete the Checked Segments as one change", async () => {
    await hold(threeSegments);
    await check(0, 2);

    barButton("刪除")!.click();
    await settle();

    expect(changes).toEqual([{ kind: "deletion", indexes: [0, 2] }]);
  });

  describe("checking every Segment", () => {
    const checkedCount = () =>
      document.querySelectorAll("input.check:checked").length;
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

      expect([checkedCount(), isBarShown()]).toEqual([3, true]);
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
    const checkStates = () =>
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

      expect([checkStates(), current()]).toEqual([
        [false, true, true, false],
        1,
      ]);
    });

    // @behavior ED-071
    it("resizes the run as another row is clicked with Shift", async () => {
      await hold(fourSegments);
      row(1).click();
      await shiftClick(3);

      await shiftClick(2);

      expect(checkStates()).toEqual([false, true, true, false]);
    });

    // @behavior ED-072
    it("checks upward from the Current Segment", async () => {
      await hold(threeSegments);
      row(2).click();

      await shiftClick(0);

      expect(checkStates()).toEqual([true, true, true]);
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

      expect([isToggled, isClicked, checkStates()]).toEqual([
        false,
        false,
        [true, true, false],
      ]);
    });

    // @behavior ED-073
    it("makes a row clicked with Shift current when no Segment is", async () => {
      await hold(threeSegments);

      await shiftClick(1);

      expect([checkStates(), current()]).toEqual([[false, false, false], 1]);
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

    // @behavior ED-117
    it("follows the selection as it moves in a text", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      const range = document.createRange();
      range.setStart(field(0).firstChild!, 3);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);

      document.dispatchEvent(new Event("selectionchange"));
      await settle();

      expect(field(0).dataset.cursor).toBe("3");
    });

    // @behavior ED-116
    it("tells no view of the Cursor when a selection change leaves it in place", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      let cursorChanges = 0;
      const unlisten = session.onChange((change) => {
        if (change === "cursor") cursorChanges++;
      });

      document.dispatchEvent(new Event("selectionchange"));
      await settle();
      unlisten();

      expect(cursorChanges).toBe(0);
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

      const page = document.createElement("div");
      mockPageMount();
      drawPage(new ProjectFeed(), new EditingSession(editingPort), page);
      const list = page.querySelector('ol[aria-label="段落"]')!.className;
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

    // @behavior ED-119
    it("shows the first half's text in the text left by a split", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      field(0).dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await settle();

      await hold(texts("你好", "世界", "今天", "天氣很好"));

      expect(field(0).textContent).toBe("你好");
    });

    // @behavior ED-054
    it("keeps the Cursor when a split is refused", async () => {
      await hold(threeSegments);
      await enter(0, 2);
      await openMenu(0);
      refusal = { code: "no-row", row: 0 };

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

      barButton("刪除")!.click();
      await settle();
      await hold(texts("一", "四"));

      expect([current(), fieldValue(field(1))]).toEqual([1, "四"]);
    });

    // @behavior ED-059
    it("keeps the merged Segment current", async () => {
      await hold(threeSegments);
      await check(1, 2);
      row(2).click();

      barButton("合併")!.click();
      await settle();
      await hold(texts("你好世界", "今天天氣很好"));

      expect(current()).toBe(1);
    });

    // @behavior ED-063
    it("keeps the Current Segment on its Segment when others before it are merged", async () => {
      await hold(texts("一", "二", "三", "四"));
      await check(0, 1);
      row(3).click();

      barButton("合併")!.click();
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

  describe("deleting by key", () => {
    function press(
      target: EventTarget,
      key = "Delete",
      options: KeyboardEventInit = {},
    ): KeyboardEvent {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      target.dispatchEvent(event);
      return event;
    }

    const textOf = (index: number) =>
      row(index).querySelector<HTMLElement>(".field.text")!;

    // @behavior ED-098
    it("deletes the Current Segment with Delete outside a text field", async () => {
      await hold(threeSegments);
      row(1).click();

      const event = press(document.body);
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([
        [{ kind: "deletion", indexes: [1] }],
        true,
      ]);
    });

    // @behavior ED-098
    it("deletes the Current Segment with focus on its check", async () => {
      await hold(threeSegments);
      const checkbox = row(1).querySelector<HTMLInputElement>("input.check")!;
      checkbox.focus();
      row(1).click();

      press(checkbox);
      await settle();

      expect(changes).toEqual([{ kind: "deletion", indexes: [1] }]);
    });

    // @behavior ED-099
    it("deletes the Checked Segments with Delete over the Current Segment", async () => {
      await hold(threeSegments);
      row(1).click();
      await check(0, 2);

      press(document.body);
      await settle();

      expect(changes).toEqual([{ kind: "deletion", indexes: [0, 2] }]);
    });

    // @behavior ED-100
    it("deletes with Backspace on macOS", async () => {
      usePlatform("macos");
      await hold(threeSegments);
      row(1).click();

      press(document.body, "Backspace");
      await settle();

      expect(changes).toEqual([{ kind: "deletion", indexes: [1] }]);
    });

    // @behavior ED-100
    it("leaves Backspace alone outside macOS", async () => {
      await hold(threeSegments);
      row(1).click();

      const event = press(document.body, "Backspace");
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([[], false]);
    });

    // @behavior ED-100
    it("deletes with Delete on macOS too", async () => {
      usePlatform("macos");
      await hold(threeSegments);
      row(1).click();

      press(document.body);
      await settle();

      expect(changes).toEqual([{ kind: "deletion", indexes: [1] }]);
    });

    // @behavior ED-098
    it.each([
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
    ])("leaves Delete with %o alone", async (modifier) => {
      await hold(threeSegments);
      row(1).click();

      press(document.body, "Delete", modifier);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-101
    it("leaves Delete in a text field to the field", async () => {
      await hold(threeSegments);
      textOf(1).focus();
      await settle();

      const event = press(textOf(1));
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([[], false]);
    });

    // @behavior ED-101
    it("leaves Delete in a time field to the field", async () => {
      await hold(threeSegments);
      row(1).click();
      const start = row(1).querySelector<HTMLInputElement>("input.start")!;

      press(start);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-102
    it("deletes nothing while a dialog is open", async () => {
      await hold(threeSegments);
      row(1).click();
      const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
      dialog.setAttribute("open", "");

      press(dialog.querySelector("button")!);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-103
    it("deletes nothing with focus on a Segment's menu", async () => {
      await hold(threeSegments);
      const opener = row(1).querySelector<HTMLElement>(
        ".dropdown [role=button]",
      )!;
      opener.focus();
      row(1).click();

      press(opener);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-103
    it("deletes nothing with focus on a drop-down list", async () => {
      await hold(threeSegments);
      row(1).click();

      press(document.querySelector("select")!);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-104
    it("deletes nothing while a Mode holds the Segments", async () => {
      await hold(threeSegments);
      row(1).click();
      await hold({ ...threeSegments, running_mode: { mode: "transcription" } });

      press(document.body);
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-105
    it("deletes once for a held key", async () => {
      await hold(threeSegments);
      row(1).click();

      press(document.body);
      press(document.body, "Delete", { repeat: true });
      press(document.body);
      await settle();

      expect(changes).toEqual([{ kind: "deletion", indexes: [1] }]);
    });

    // @behavior ED-106
    it("leaves Delete alone with nothing to delete", async () => {
      await hold(threeSegments);

      const event = press(document.body);
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([[], false]);
    });
  });

  describe("merging by key", () => {
    function press(
      target: EventTarget,
      key: string,
      options: KeyboardEventInit = { ctrlKey: true, altKey: true },
    ): KeyboardEvent {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      target.dispatchEvent(event);
      return event;
    }

    const textOf = (index: number) =>
      row(index).querySelector<HTMLElement>(".field.text")!;

    // @behavior ED-171
    it("merges the Current Segment with the one before with Ctrl+Alt+Up", async () => {
      await hold(threeSegments);
      row(1).click();

      const event = press(document.body, "ArrowUp");
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([
        [{ kind: "merge", first: 0, last: 1 }],
        true,
      ]);
    });

    // @behavior ED-172
    it("merges the Current Segment with the one after with Ctrl+Alt+Down", async () => {
      await hold(threeSegments);
      row(1).click();

      press(document.body, "ArrowDown");
      await settle();

      expect(changes).toEqual([{ kind: "merge", first: 1, last: 2 }]);
    });

    // @behavior ED-173
    it("merges with ⌘+Option+Down while a text is edited on macOS", async () => {
      usePlatform("macos");
      await hold(threeSegments);
      textOf(1).focus();
      await settle();

      press(textOf(1), "ArrowDown", { metaKey: true, altKey: true });
      await settle();

      expect(changes).toEqual([{ kind: "merge", first: 1, last: 2 }]);
    });

    // @behavior ED-197
    it("leaves the merge shortcut to an input method processing the key", async () => {
      await hold(threeSegments);
      textOf(1).focus();
      await settle();

      const event = press(textOf(1), "ArrowDown", {
        ctrlKey: true,
        altKey: true,
        keyCode: 229,
      });
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([[], false]);
    });

    // @behavior ED-182
    it("writes a text still being typed before merging", async () => {
      await hold(threeSegments);
      const text = textOf(1);
      text.focus();
      await settle();
      text.textContent = "你好";
      document.getSelection()!.collapse(text.firstChild!, 2);
      document.dispatchEvent(new Event("selectionchange"));
      await settle();

      press(text, "ArrowDown");
      await settle();

      expect([sentCommands, changes]).toEqual([
        ["edit_segment", "change_segments"],
        [{ kind: "merge", first: 1, last: 2 }],
      ]);
    });

    // @behavior ED-174
    it("merges nothing before the first Segment", async () => {
      await hold(threeSegments);
      row(0).click();

      const event = press(document.body, "ArrowUp");
      await settle();

      expect([changes, event.defaultPrevented]).toEqual([[], false]);
    });

    it("merges nothing after the last Segment", async () => {
      await hold(threeSegments);
      row(2).click();

      press(document.body, "ArrowDown");
      await settle();

      expect(changes).toEqual([]);
    });

    it("leaves Up with Ctrl alone", async () => {
      await hold(threeSegments);
      row(1).click();

      press(document.body, "ArrowUp", { ctrlKey: true });
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-175
    it("merges nothing while a dialog is open", async () => {
      await hold(threeSegments);
      row(1).click();
      const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
      dialog.setAttribute("open", "");

      press(dialog.querySelector("button")!, "ArrowUp");
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-176
    it("merges nothing while a Mode holds the Segments", async () => {
      await hold(threeSegments);
      row(1).click();
      await hold({ ...threeSegments, running_mode: { mode: "transcription" } });

      press(document.body, "ArrowUp");
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior ED-177
    it("merges once for a held key", async () => {
      await hold(threeSegments);
      row(1).click();

      press(document.body, "ArrowUp");
      press(document.body, "ArrowUp", {
        ctrlKey: true,
        altKey: true,
        repeat: true,
      });
      press(document.body, "ArrowUp");
      await settle();

      expect(changes).toEqual([{ kind: "merge", first: 0, last: 1 }]);
    });
  });

  describe("merging from a Segment's menu", () => {
    const isChoiceHidden = (index: number, action: string) =>
      row(index).querySelector(`button.${action}`) === null;

    // @behavior ED-178
    it("merges a Segment with the one before", async () => {
      await hold(threeSegments);

      await choose(1, "mergeWithPrevious");

      expect(changes).toEqual([{ kind: "merge", first: 0, last: 1 }]);
    });

    // @behavior ED-179
    it("merges a Segment with the one after", async () => {
      await hold(threeSegments);

      await choose(1, "mergeWithNext");

      expect(changes).toEqual([{ kind: "merge", first: 1, last: 2 }]);
    });

    // @behavior ED-180
    it("offers no merge past either end", async () => {
      await hold(threeSegments);

      expect([
        isChoiceHidden(0, "mergeWithPrevious"),
        isChoiceHidden(0, "mergeWithNext"),
        isChoiceHidden(1, "mergeWithPrevious"),
        isChoiceHidden(1, "mergeWithNext"),
        isChoiceHidden(2, "mergeWithPrevious"),
        isChoiceHidden(2, "mergeWithNext"),
      ]).toEqual([true, false, false, false, false, true]);
    });

    // @behavior ED-180
    it("offers the merge after a row that is no longer the last", async () => {
      await hold(projectOf({ segments: threeSegments.segments.slice(0, 2) }));

      await hold(threeSegments);

      expect(isChoiceHidden(1, "mergeWithNext")).toBe(false);
    });
  });

  describe("the right-click menu", () => {
    const lastMenu = () => menus[menus.length - 1];
    const texts = (items: MenuItemSent[]) =>
      items.map((item) => item.text ?? item.item);
    /** The text of each visible button in `container`, as the menu it belongs to shows it. */
    const buttonTexts = (container: Element) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => !button.closest("[hidden]"))
        .map((button) => button.firstChild!.textContent);

    async function rightClick(target: Element): Promise<boolean> {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      await settle();
      return event.defaultPrevented;
    }

    // @behavior ED-164
    it("offers a Segment's menu beside the pointer in place of the page's own", async () => {
      await hold(threeSegments);

      const isTaken = await rightClick(row(0));

      expect([isTaken, popupCount, texts(lastMenu())]).toEqual([
        true,
        1,
        buttonTexts(row(0).querySelector(".change-menu")!),
      ]);
    });

    // @behavior ED-165
    it("makes the right-clicked Segment current", async () => {
      await hold(threeSegments);

      await rightClick(row(1).querySelector(".start")!);

      expect(row(1).hasAttribute("aria-current")).toBe(true);
    });

    // @behavior ED-166
    it("changes the Segment as the choice in its right-click menu says", async () => {
      await hold(threeSegments);
      await rightClick(row(0));
      const insertBelowButton = row(0).querySelector("button.insertAfter")!;

      const choice = lastMenu().find(
        (item) => item.text === insertBelowButton.firstChild!.textContent,
      )!;
      choice.handler!.onmessage(choice.id!);
      await settle();

      expect(changes).toEqual([{ kind: "insertion-after", index: 0 }]);
    });

    // @behavior ED-167
    it("offers the changes for the Checked Segments while some are checked", async () => {
      await hold(threeSegments);
      await check(0, 1);

      await rightClick(row(2));

      const bar = screen.getByText(/^已勾選 \d+ 段$/).parentElement!;
      expect(texts(lastMenu())).toEqual(buttonTexts(bar));
    });

    // @behavior ED-168
    it("puts cut, copy and paste ahead of the changes in a text field", async () => {
      await hold(threeSegments);

      await rightClick(row(0).querySelector(".field.text")!);

      expect(
        lastMenu()
          .slice(0, 4)
          .map((item) => item.item),
      ).toEqual(["Cut", "Copy", "Paste", "Separator"]);
    });

    it("leaves cut, copy and paste out away from a text field", async () => {
      await hold(threeSegments);

      await rightClick(row(0));

      expect(lastMenu().some((item) => item.item === "Cut")).toBe(false);
    });

    // @behavior ED-169
    it("carries a choice's shortcut into the right-click menu", async () => {
      await hold(threeSegments);
      await rightClick(row(0));
      const splitButton = row(0).querySelector("button.split")!;

      const choice = lastMenu().find(
        (item) => item.text === splitButton.firstChild!.textContent,
      )!;

      expect(choice.accelerator).toBe("Ctrl+Alt+Enter");
    });

    // @behavior ED-170
    it("offers the changes a running Mode holds disabled", async () => {
      await hold({
        ...threeSegments,
        shown_translation: "en",
        running_mode: { mode: "translation", language: "en", indexes: null },
      });

      await rightClick(row(0));

      expect(lastMenu().map((item) => item.enabled)).not.toContain(true);
    });
  });
});
