// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { assemble } from "../assembly";
import { projectOf } from "../test_project";
import type { EditingSession } from "../editor";
import FieldController, { composingOption } from "./field_controller";

describe("FieldController", () => {
  let application: Application;
  let edits: unknown[];
  let session: EditingSession;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const fieldAt = (index: number) =>
    document.querySelectorAll<HTMLElement>("[data-controller]")[index];
  const field = () => fieldAt(0);

  beforeEach(async () => {
    edits = [];
    const actions =
      "focus->field#enter blur->field#leave compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#enterNext:!composing:prevent keydown.shift+enter->field#breakLine:!composing:prevent keydown.esc->field#revert:!composing:prevent";
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
    const assembly = assemble(application, {
      field: FieldController,
    });
    session = assembly.session;
    await assembly.start();
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
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    field().focus();
    field().textContent = "大家好啊";

    const taken = isEnterTaken({ code: "NumpadEnter" });
    await settle();

    expect([
      taken,
      execCommand.mock.calls,
      document.activeElement,
      edits,
    ]).toEqual([
      true,
      [],
      fieldAt(1),
      [{ index: 0, field: "text", value: "大家好啊" }],
    ]);
  });

  // @behavior ED-075
  it("is left after the last Segment with Enter", async () => {
    fieldAt(1).focus();
    fieldAt(1).textContent = "今天天氣很好";

    isEnterTaken({}, fieldAt(1));
    await settle();

    expect([document.activeElement, edits]).toEqual([
      document.body,
      [{ index: 1, field: "text", value: "今天天氣很好" }],
    ]);
  });

  // @behavior ED-076
  it("types a line break with Shift+Enter", async () => {
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    field().focus();

    const taken = isEnterTaken({ shiftKey: true });

    expect([taken, execCommand.mock.calls, document.activeElement]).toEqual([
      true,
      [["insertLineBreak"]],
      field(),
    ]);
  });

  /** Presses Esc in the field, answering whether the field took the key. */
  function isEscTaken(init: KeyboardEventInit = {}): boolean {
    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
      ...init,
    });
    field().dispatchEvent(esc);
    return esc.defaultPrevented;
  }

  // @behavior ED-077
  it("puts back the text it was entered with on Esc", async () => {
    field().focus();
    field().dispatchEvent(new FocusEvent("focus"));
    field().textContent = "大家好啊";

    isEscTaken();
    await settle();

    expect([
      field().textContent,
      document.activeElement === field(),
      edits,
      session.cursor,
    ]).toEqual(["大家好", false, [], { index: 0, caret: null }]);
  });

  // @behavior ED-078
  it("leaves Esc to an input method while it composes", async () => {
    field().focus();
    field().dispatchEvent(new FocusEvent("focus"));
    field().textContent = "大家好ㄋ";

    const isTaken = isEscTaken({ isComposing: true });
    await settle();

    expect([
      isTaken,
      field().textContent,
      document.activeElement === field(),
    ]).toEqual([false, "大家好ㄋ", true]);
  });
});
