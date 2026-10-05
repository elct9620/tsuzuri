// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test-project";
import {
  showNotifications,
  notifications,
} from "../components/test-notifications";
import CleanupController from "./cleanup-controller";
import FieldController, { composingOption } from "./field-controller";
import SegmentChangesController from "./segment-changes-controller";
import TranscriptController from "./transcript-controller";
import { typingOption } from "./segment-changes-controller";

describe("CleanupController", () => {
  let application: Application;
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
      <section data-controller="transcript segment-changes cleanup"
        data-action="selectionchange@document->transcript#followSelection editor:cursor@window->transcript#showCursor editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked keydown.ctrl+shift+t@window->cleanup#cleanByShortcut:prevent keydown.meta+shift+t@window->cleanup#cleanByShortcut:prevent rust:edit-command@window->cleanup#applyEditCommand transcript:shown->cleanup#follow transcript:shown->segment-changes#followTasks">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <div data-segment-changes-target="checkedBar" hidden>
          <span data-segment-changes-target="checkedCount"></span>
          <button data-segment-changes-target="mergeButton"></button>
          <button data-segment-changes-target="retranslateButton"></button>
          <button data-segment-changes-target="retranscribeButton"></button>
          <button id="clean-checked" data-cleanup-target="checkedButton" data-action="cleanup#cleanChecked"></button>
        </div>
        <dialog data-segment-changes-target="shiftDialog">
          <input data-segment-changes-target="offset" />
        </dialog>
        <dialog id="other-dialog"><input id="other-input" /></dialog>
        <ol data-transcript-target="list"></ol>
      </section>
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
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    application.registerActionOption("typing", typingOption);
    await assemble(application, {
      field: FieldController,
      transcript: TranscriptController,
      "segment-changes": SegmentChangesController,
      cleanup: CleanupController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  function check(index: number): void {
    const box = document.querySelector<HTMLInputElement>(
      `.check[data-index="${index}"]`,
    )!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
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

  function segmentMenuCleanup(index: number): HTMLButtonElement {
    return document.querySelectorAll<HTMLButtonElement>("button.cleanup")[
      index
    ];
  }

  // @behavior ED-128
  it("cleans the Checked Segments by shortcut and tells how many characters", async () => {
    await hold(projectInTraditionalChinese);
    check(0);
    check(2);

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
    document
      .querySelectorAll<HTMLElement>("[data-transcript-target='list'] > li")[1]
      .click();

    pressCleanup();
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [1] }]);
  });

  // @behavior ED-135
  it("cleans what is marked when chosen from the Edit menu", async () => {
    await hold(projectInTraditionalChinese);
    check(1);

    await emit("edit-command", "clean-simplified");
    await settle();

    expect(cleanups()).toEqual([{ kind: "segments", indexes: [1] }]);
  });

  // @behavior ED-136
  it("cleans nothing by shortcut while a dialog holds focus", async () => {
    await hold(projectInTraditionalChinese);
    check(0);
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
    check(0);
    check(1);

    document.querySelector<HTMLButtonElement>("#clean-checked")!.click();
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
    check(0);

    expect([
      segmentMenuCleanup(0).closest("li")!.hidden,
      document.querySelector<HTMLButtonElement>("#clean-checked")!.hidden,
    ]).toEqual([true, true]);
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

    expect(segmentMenuCleanup(0).closest("li")!.hidden).toBe(false);
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
