// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { setInterfaceLanguage } from "../i18n";
import { projectOf } from "../test-project";
import { pageContext } from "./context";
import ShiftDialog from "./ShiftDialog.svelte";
import { showNotifications } from "./test-notifications";
import {
  checkedBarButton,
  drawSegmentList,
  segmentDialogsOf,
} from "./test-segment-rows";

describe("ShiftDialog", () => {
  let application: Application;
  let project: ProjectView | null;
  let changes: unknown[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  const row = (index: number) =>
    document.querySelectorAll<HTMLLIElement>("ol > li")[index];

  const threeSegments = projectOf({
    segments: [
      { start_ms: 0, end_ms: 1000, text: "你好世界" },
      { start_ms: 1000, end_ms: 2000, text: "今天" },
      { start_ms: 2000, end_ms: 3000, text: "天氣很好" },
    ],
  });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function setCheck(index: number, isChecked: boolean): Promise<void> {
    const checkbox = row(index).querySelector<HTMLInputElement>("input.check")!;
    checkbox.checked = isChecked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  /** Opens the dialog from the checked bar and types `offset` as the milliseconds to shift by. */
  function openShiftBy(offset: string): void {
    checkedBarButton("平移……")!.click();
    screen.getByRole<HTMLInputElement>("spinbutton", {
      hidden: true,
      name: /^毫秒/,
    }).value = offset;
  }

  async function shift(): Promise<void> {
    screen.getByRole("button", { hidden: true, name: "平移" }).click();
    await settle();
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
    changes = [];
    document.body.innerHTML = `
      <section></section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "change_segments")
          changes.push((args as { change: unknown }).change);
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    const assembly = assemble(application, {});
    const context = pageContext(assembly.feed, assembly.session);
    const shift = render(ShiftDialog, { context }).component;
    drawSegmentList(
      document.querySelector("section")!,
      context,
      segmentDialogsOf({ shift }),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior ED-019
  it("asks to shift the Checked Segments", async () => {
    await hold(threeSegments);
    await setCheck(1, true);
    await setCheck(2, true);
    openShiftBy("500");

    await shift();

    expect(changes).toEqual([
      { kind: "shift", first: 1, last: 2, offset_ms: 500 },
    ]);
  });

  // @behavior ED-113
  it("shifts nothing while the offset is empty", async () => {
    await hold(threeSegments);
    await setCheck(1, true);
    await setCheck(2, true);
    openShiftBy("");

    await shift();

    expect([changes, dialog().open]).toEqual([[], true]);
  });

  // @behavior ED-114
  it("shifts nothing once no Segment is checked", async () => {
    await hold(threeSegments);
    await setCheck(1, true);
    openShiftBy("500");
    await setCheck(1, false);

    await shift();

    expect(changes).toEqual([]);
  });
});
