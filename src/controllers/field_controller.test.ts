// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { assemble } from "../assembly";
import { projectOf } from "../test_project";
import FieldController, { composingOption } from "./field_controller";

describe("FieldController", () => {
  let application: Application;
  let edits: unknown[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const fields = (index: number) =>
    document.querySelectorAll<HTMLElement>("[data-controller]")[index];
  const field = () => fields(0);

  beforeEach(async () => {
    edits = [];
    const actions =
      "focus->field#enter blur->field#leave compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#commit:!composing:prevent keydown.shift+enter->field#breakLine:!composing:prevent";
    document.body.innerHTML = `
      <div id="editor">
        <div class="field text" contenteditable="plaintext-only" data-controller="field" data-index="0" data-field="text"
          data-action="${actions}">大家好</div>
        <div class="field text" contenteditable="plaintext-only" data-controller="field" data-index="1" data-field="text"
          data-action="${actions}">今天天氣</div>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project")
          return projectOf({
            segments: [
              { start_ms: 0, end_ms: 1000, text: "大家好" },
              { start_ms: 1000, end_ms: 2000, text: "今天天氣" },
            ],
          });
        if (command === "edit_segment") edits.push(args);
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    await assemble(application, {
      field: FieldController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior ED-029
  it("writes nothing when left unchanged", async () => {
    field().dispatchEvent(new FocusEvent("focus"));
    field().dispatchEvent(new FocusEvent("blur"));
    await settle();

    expect(edits).toEqual([]);
  });

  it("writes its text when left changed", async () => {
    field().dispatchEvent(new FocusEvent("focus"));
    field().textContent = "大家好啊";
    field().dispatchEvent(new FocusEvent("blur"));
    await settle();

    expect(edits).toEqual([{ index: 0, field: "text", value: "大家好啊" }]);
  });

  /** Whether pressing Enter lets the field take the key. */
  function isEnterTaken(
    init: KeyboardEventInit = {},
    target = field(),
  ): boolean {
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(enter);
    return enter.defaultPrevented;
  }

  // @behavior ED-031
  it("leaves Enter to an input method while it composes", async () => {
    const whileComposing = isEnterTaken({ isComposing: true });
    const keyInProcess = isEnterTaken({ keyCode: 229 });
    field().dispatchEvent(new CompositionEvent("compositionstart"));
    field().dispatchEvent(new CompositionEvent("compositionend"));
    // WebKit ends the composition before the Enter that picks the candidate arrives.
    const rightAfterComposing = isEnterTaken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const typedAfterward = isEnterTaken();

    expect([
      whileComposing,
      keyInProcess,
      rightAfterComposing,
      typedAfterward,
    ]).toEqual([false, false, false, true]);
  });

  // @behavior ED-074
  it("moves to the next Segment's text with Enter", async () => {
    const typed = vi.fn(() => true);
    document.execCommand = typed;
    field().focus();
    field().textContent = "大家好啊";

    const taken = isEnterTaken({ code: "NumpadEnter" });
    await settle();

    expect([taken, typed.mock.calls, document.activeElement, edits]).toEqual([
      true,
      [],
      fields(1),
      [{ index: 0, field: "text", value: "大家好啊" }],
    ]);
  });

  // @behavior ED-076
  it("is left after the last Segment with Enter", async () => {
    fields(1).focus();
    fields(1).textContent = "今天天氣很好";

    isEnterTaken({}, fields(1));
    await settle();

    expect([document.activeElement, edits]).toEqual([
      document.body,
      [{ index: 1, field: "text", value: "今天天氣很好" }],
    ]);
  });

  // @behavior ED-075
  it("types a line break with Shift+Enter", async () => {
    const typed = vi.fn(() => true);
    document.execCommand = typed;
    field().focus();

    const taken = isEnterTaken({ shiftKey: true });

    expect([taken, typed.mock.calls, document.activeElement]).toEqual([
      true,
      [["insertLineBreak"]],
      field(),
    ]);
  });
});
