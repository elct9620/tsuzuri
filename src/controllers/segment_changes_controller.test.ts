// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../backend/project";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import { projectOf } from "../test_project";
import SegmentChangesController from "./segment_changes_controller";
import TranscriptController from "./transcript_controller";

describe("SegmentChangesController", () => {
  let application: Application;
  let project: ProjectView | null;
  let changes: unknown[];

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

  async function select(...indexes: number[]): Promise<void> {
    for (const index of indexes) {
      const checkbox =
        row(index).querySelector<HTMLInputElement>("input.selection")!;
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
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript segment-changes">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="empty"></p>
        <div data-segment-changes-target="selection" hidden>
          <span data-segment-changes-target="selectionCount"></span>
          <button id="merge" data-segment-changes-target="merge" data-action="segment-changes#merge">合併</button>
          <button id="open-shift" data-action="segment-changes#openShift">平移</button>
        </div>
        <dialog data-segment-changes-target="shiftDialog">
          <input type="number" data-segment-changes-target="offset" />
          <button id="shift" data-action="segment-changes#shift">平移</button>
        </dialog>
        <ol data-transcript-target="list"></ol>
        <datalist id="speakers" data-transcript-target="speakers"></datalist>
      </section>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "change_segments")
          changes.push((args as { change: unknown }).change);
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("transcript", TranscriptController);
    application.register("segment-changes", SegmentChangesController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
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

  // @behavior ED-017
  it("asks to split a Segment where its cursor was left", async () => {
    await hold(threeSegments);
    const text = row(0).querySelector<HTMLTextAreaElement>("textarea.text")!;
    text.setSelectionRange(2, 2);

    await choose(0, "split");

    expect(changes).toEqual([{ kind: "split", index: 0, at: 2 }]);
  });

  // @behavior ED-018
  it("asks to merge the Segments selected", async () => {
    await hold(threeSegments);
    await select(0, 1);

    document.querySelector<HTMLButtonElement>("#merge")!.click();
    await settle();

    expect(changes).toEqual([{ kind: "merge", first: 0, last: 1 }]);
  });

  // @behavior ED-019
  it("asks to shift the Segments selected", async () => {
    await hold(threeSegments);
    await select(1, 2);
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

    await select(0, 2);

    expect(document.querySelector<HTMLButtonElement>("#merge")!.disabled).toBe(
      true,
    );
  });

  // @behavior ED-021
  it("clears the selection once the Segments change", async () => {
    await hold(threeSegments);
    await select(0, 1);

    await choose(2, "delete");

    expect([
      document.querySelectorAll("input.selection:checked").length,
      document.querySelector<HTMLElement>(
        '[data-segment-changes-target="selection"]',
      )!.hidden,
    ]).toEqual([0, true]);
  });
});
