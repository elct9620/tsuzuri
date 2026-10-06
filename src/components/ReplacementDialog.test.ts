// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "#/assembly.ts";
import type { ProjectView } from "#/ipc/project.ts";
import { projectOf } from "#/testing/project.ts";
import { showNotifications, notifications } from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import ReplacementDialog from "#/components/ReplacementDialog.svelte";
import { drawSegmentRows } from "#/testing/segment-rows.ts";
import { usePlatform } from "#/testing/platform.ts";
import { settle } from "#/testing/settle.ts";

describe("ReplacementDialog", () => {
  let project: ProjectView | null;
  let replaceArgs: unknown[];
  let count: number;

  const dialog = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  const textbox = (name: string) =>
    screen.getByRole<HTMLInputElement>("textbox", { hidden: true, name });
  /** Types `value` into the text box named `name`, as the user would. */
  function type(name: string, value: string): void {
    textbox(name).value = value;
    textbox(name).dispatchEvent(new Event("input", { bubbles: true }));
  }
  const fieldChoice = (name: string) =>
    screen.getByRole<HTMLInputElement>("radio", { hidden: true, name });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  const translatedProject = projectOf({
    translation_language: "en",
    shown_translation: "en",
    segments: [
      {
        start_ms: 0,
        end_ms: 1000,
        text: "你好，世界",
        translation: "Hello, world",
      },
    ],
  });

  beforeEach(async () => {
    project = null;
    replaceArgs = [];
    count = 1;
    document.body.innerHTML = `
      <section>
      </section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "replace_text") {
          replaceArgs.push(args);
          return count;
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    const context = pageContext(assembly.feed, assembly.session);
    drawSegmentRows(document.querySelector("section")!, context);
    render(ReplacementDialog, { context });
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

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

  function press(init: KeyboardEventInit, on: EventTarget = window): void {
    on.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }

  // @behavior ED-087
  it("opens by shortcut to find the text the Cursor selects", async () => {
    await hold(translatedProject);
    const text = selectText(2, 3);

    press({ key: "h", code: "KeyH", ctrlKey: true }, text);
    await settle();

    expect([
      dialog().open,
      textbox("尋找").value,
      document.activeElement === textbox("尋找"),
    ]).toEqual([true, "，", true]);
  });

  // @behavior ED-183
  it("stays closed without a Project, leaving the key to the page", async () => {
    const event = new KeyboardEvent("keydown", {
      key: "h",
      code: "KeyH",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);
    await settle();

    expect([dialog().open, event.defaultPrevented]).toEqual([false, false]);
  });

  it("opens by ⌘+Option+F on macOS, whose key Option changes, leaving Ctrl+H to the text", async () => {
    usePlatform("macos");
    await hold(translatedProject);

    press({ key: "h", code: "KeyH", ctrlKey: true });
    await settle();
    const isOpenByCtrlH = dialog().open;
    press({ key: "ƒ", code: "KeyF", metaKey: true, altKey: true });
    await settle();

    expect([isOpenByCtrlH, dialog().open]).toEqual([false, true]);
  });

  it("opens by ⌘+Option+F on macOS with Shift held too", async () => {
    usePlatform("macos");
    await hold(translatedProject);

    press({
      key: "Ï",
      code: "KeyF",
      metaKey: true,
      altKey: true,
      shiftKey: true,
    });

    expect(dialog().open).toBe(true);
  });

  it("opens by the key that types H, wherever it is", async () => {
    await hold(translatedProject);

    press({ key: "d", code: "KeyH", ctrlKey: true });
    const isOpenByPlace = dialog().open;
    press({ key: "h", code: "KeyJ", ctrlKey: true });

    expect([isOpenByPlace, dialog().open]).toEqual([false, true]);
  });

  it.each([{ shiftKey: true }, { altKey: true }, { metaKey: true }])(
    "leaves Ctrl+H with %o alone",
    async (modifier) => {
      await hold(translatedProject);

      press({ key: "h", code: "KeyH", ctrlKey: true, ...modifier });

      expect(dialog().open).toBe(false);
    },
  );

  // @behavior ED-088
  it("replaces with Enter and says how many were replaced", async () => {
    await hold(translatedProject);
    count = 2;
    press({ key: "h", code: "KeyH", ctrlKey: true });
    type("尋找", "，");
    type("取代為", " ");
    fieldChoice("譯文").click();
    screen.getByRole("checkbox", { hidden: true, name: /正規表示式/ }).click();

    press({ key: "Enter" }, textbox("取代為"));
    await settle();

    expect([replaceArgs, dialog().open, notifications()]).toEqual([
      [
        {
          field: "translation",
          replacement: { pattern: "，", substitute: " ", is_regex: true },
        },
      ],
      false,
      ["已取代 2 處"],
    ]);
  });

  // @behavior ED-089
  it("stays open when nothing matches", async () => {
    await hold(translatedProject);
    count = 0;
    press({ key: "h", code: "KeyH", ctrlKey: true });
    type("尋找", "。");

    press({ key: "Enter" }, textbox("取代為"));
    await settle();

    expect([dialog().open, notifications()]).toEqual([
      true,
      ["沒有符合的文字"],
    ]);
  });

  it("replaces only in the original while no translation is shown", async () => {
    await hold(projectOf({ segments: translatedProject.segments }));
    fieldChoice("譯文").click();

    press({ key: "h", code: "KeyH", ctrlKey: true });
    await settle();

    expect([fieldChoice("譯文").disabled, fieldChoice("原文").checked]).toEqual(
      [true, true],
    );
  });
});
