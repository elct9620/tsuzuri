// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "#/assembly.ts";
import type { ProjectView } from "#/ipc/project.ts";
import { projectOf } from "#/testing/project.ts";
import { showNotifications, notifications } from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import {
  drawSegmentList,
  segmentDialogsOf,
  segmentRows,
} from "#/testing/segment-rows.ts";

describe("cleanup", () => {
  let project: ProjectView | null;
  let sentCalls: [string, unknown][];
  let count: number;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const projectInTraditionalChinese = projectOf({
    segments: [
      { start_ms: 0, end_ms: 1000, text: "这是测试" },
      { start_ms: 1000, end_ms: 2000, text: "还没" },
      { start_ms: 2000, end_ms: 3000, text: "好了" },
    ],
  });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  beforeEach(async () => {
    project = null;
    sentCalls = [];
    count = 2;
    document.body.innerHTML = `
      <section></section>
      <dialog id="other-dialog"><input id="other-input" /></dialog>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "clean_simplified" || command === "edit_segment") {
          sentCalls.push([command, args]);
          return command === "clean_simplified" ? count : null;
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    drawSegmentList(
      document.querySelector("section")!,
      pageContext(assembly.feed, assembly.session),
      segmentDialogsOf({}),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

  async function check(index: number): Promise<void> {
    const box = segmentRows()[index].querySelector<HTMLInputElement>(".check")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  function pressCleanup(on: EventTarget = window): void {
    on.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "T",
        code: "KeyT",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function cleanups(): unknown[] {
    return sentCalls
      .filter(([command]) => command === "clean_simplified")
      .map(([, args]) => (args as { scope: unknown }).scope);
  }

  /** The checked bar's cleanup, the only one named by its label alone, as a menu's shows its keys. */
  const checkedBarCleanup = () =>
    screen.queryByRole("button", { name: "清理簡體", hidden: true });

  function segmentMenuCleanup(index: number): HTMLButtonElement {
    return document.querySelectorAll<HTMLButtonElement>("button.cleanup")[
      index
    ];
  }

  // @behavior ED-128
  it("cleans the Checked Segments by shortcut and tells how many characters", async () => {
    await hold(projectInTraditionalChinese);
    await check(0);
    await check(2);

    pressCleanup();
    await settle();

    expect([cleanups(), notifications()]).toEqual([
      [{ kind: "segments", indexes: [0, 2] }],
      ["已清理 2 個簡體字"],
    ]);
  });

  // @behavior ED-129
  it("writes the typed text, then cleans the range the Cursor selects", async () => {
    await hold(projectInTraditionalChinese);
    const text = document.querySelector<HTMLElement>(".field.text")!;
    text.focus();
    text.textContent = "这是测试啊";
    const range = document.createRange();
    range.setStart(text.firstChild!, 2);
    range.setEnd(text.firstChild!, 4);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    pressCleanup(text);
    await settle();

    expect([document.activeElement === text, sentCalls]).toEqual([
      false,
      [
        ["edit_segment", { index: 0, field: "text", value: "这是测试啊" }],
        [
          "clean_simplified",
          {
            scope: { kind: "range", index: 0, field: "text", start: 2, end: 4 },
          },
        ],
      ],
    ]);
  });

  // @behavior ED-130
  it("cleans the Current Segment by shortcut when nothing is marked", async () => {
    await hold(projectInTraditionalChinese);
    segmentRows()[1].click();

    pressCleanup();
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [1] }]);
  });

  // @behavior ED-135
  it("cleans what is marked when chosen from the Edit menu", async () => {
    await hold(projectInTraditionalChinese);
    await check(1);

    await emit("edit-command", "clean-simplified");
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [1] }]);
  });

  // @behavior ED-136
  it("cleans nothing by shortcut while a dialog holds focus", async () => {
    await hold(projectInTraditionalChinese);
    await check(0);
    const dialog = document.querySelector<HTMLDialogElement>("#other-dialog")!;
    dialog.setAttribute("open", "");
    const input = document.querySelector<HTMLInputElement>("#other-input")!;
    input.focus();

    pressCleanup(input);
    await settle();

    expect([cleanups(), document.activeElement === input]).toEqual([[], true]);
  });

  // @behavior ED-131
  it("cleans a Segment from its menu", async () => {
    await hold(projectInTraditionalChinese);

    segmentMenuCleanup(1).click();
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [1] }]);
  });

  // @behavior ED-132
  it("cleans the Checked Segments from their bar", async () => {
    await hold(projectInTraditionalChinese);
    await check(0);
    await check(1);

    checkedBarCleanup()!.click();
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [0, 1] }]);
  });

  // @behavior ED-133
  it("offers no cleanup without a text in zh-TW", async () => {
    await hold(
      projectOf({
        language: "en",
        segments: projectInTraditionalChinese.segments,
      }),
    );
    await check(0);

    expect([segmentMenuCleanup(0), checkedBarCleanup()]).toEqual([
      undefined,
      null,
    ]);
  });

  // @behavior ED-133
  it("offers a cleanup of a zh-TW translation shown", async () => {
    await hold(
      projectOf({
        language: "ja",
        shown_translation: "zh-TW",
        segments: projectInTraditionalChinese.segments,
      }),
    );

    expect(segmentMenuCleanup(0)).toBeDefined();
  });

  // @behavior ED-134
  it("tells when there was no Simplified Chinese to clean", async () => {
    count = 0;
    await hold(projectInTraditionalChinese);

    segmentMenuCleanup(0).click();
    await settle();

    expect(notifications()).toEqual(["沒有需要清理的簡體字"]);
  });
});
