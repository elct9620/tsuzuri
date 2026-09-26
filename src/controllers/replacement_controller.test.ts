// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import FieldController, { composingOption } from "./field_controller";
import ReplacementController from "./replacement_controller";
import TranscriptController from "./transcript_controller";

describe("ReplacementController", () => {
  let application: Application;
  let project: ProjectView | null;
  let replaced: unknown[];
  let count: number;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-replacement-target="${name}"]`)!;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  const translated = projectOf({
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
    replaced = [];
    count = 1;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript replacement"
        data-action="editor:cursor@window->transcript#showCursor keydown@window->replacement#openByShortcut">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <dialog data-replacement-target="dialog">
          <input id="pattern" data-replacement-target="pattern" />
          <input id="substitute" data-replacement-target="substitute"
            data-action="keydown.enter->replacement#apply:!composing:prevent" />
          <input type="radio" name="replacement-field" value="text" data-replacement-target="field" checked />
          <input type="radio" name="replacement-field" value="translation" data-replacement-target="field" />
          <input type="checkbox" data-replacement-target="regexToggle" />
        </dialog>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "replace_text") {
          replaced.push(args);
          return count;
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    await assemble(application, {
      field: FieldController,
      transcript: TranscriptController,
      replacement: ReplacementController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
    });
  });

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

  function press(init: KeyboardEventInit, on: EventTarget = window): void {
    on.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }

  // @behavior ED-084
  it("opens by shortcut to find the text the Cursor selects", async () => {
    await hold(translated);
    const text = selectText(2, 3);

    press({ key: "h", code: "KeyH", ctrlKey: true }, text);
    await settle();

    expect([
      target<HTMLDialogElement>("dialog").open,
      target<HTMLInputElement>("pattern").value,
      document.activeElement === target("pattern"),
    ]).toEqual([true, "，", true]);
  });

  it("opens by ⌘+Option+F on macOS, whose key Option changes, leaving Ctrl+H to the text", async () => {
    Object.assign(window, {
      __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
    });
    await hold(translated);

    press({ key: "h", code: "KeyH", ctrlKey: true });
    await settle();
    const isOpenByCtrlH = target<HTMLDialogElement>("dialog").open;
    press({ key: "ƒ", code: "KeyF", metaKey: true, altKey: true });
    await settle();

    expect([isOpenByCtrlH, target<HTMLDialogElement>("dialog").open]).toEqual([
      false,
      true,
    ]);
  });

  // @behavior ED-085
  it("replaces with Enter and says how many were replaced", async () => {
    await hold(translated);
    count = 2;
    press({ key: "h", code: "KeyH", ctrlKey: true });
    target<HTMLInputElement>("pattern").value = "，";
    target<HTMLInputElement>("substitute").value = " ";
    document.querySelector<HTMLInputElement>('[value="translation"]')!.checked =
      true;
    target<HTMLInputElement>("regexToggle").checked = true;

    press({ key: "Enter" }, target("substitute"));
    await settle();

    expect([
      replaced,
      target<HTMLDialogElement>("dialog").open,
      notifications(),
    ]).toEqual([
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

  // @behavior ED-086
  it("stays open when nothing matches", async () => {
    await hold(translated);
    count = 0;
    press({ key: "h", code: "KeyH", ctrlKey: true });
    target<HTMLInputElement>("pattern").value = "。";

    press({ key: "Enter" }, target("substitute"));
    await settle();

    expect([target<HTMLDialogElement>("dialog").open, notifications()]).toEqual(
      [true, ["沒有符合的文字"]],
    );
  });

  it("replaces only in the original while no translation is shown", async () => {
    await hold(projectOf({ segments: translated.segments }));
    document.querySelector<HTMLInputElement>('[value="translation"]')!.checked =
      true;

    press({ key: "h", code: "KeyH", ctrlKey: true });
    await settle();

    expect([
      document.querySelector<HTMLInputElement>('[value="translation"]')!
        .disabled,
      document.querySelector<HTMLInputElement>('[value="text"]')!.checked,
    ]).toEqual([true, true]);
  });
});
