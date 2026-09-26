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
  const field = () => document.querySelector<HTMLElement>("[data-controller]")!;

  beforeEach(async () => {
    edits = [];
    document.body.innerHTML = `
      <div id="editor">
        <div contenteditable="plaintext-only" data-controller="field" data-index="0" data-field="text"
          data-action="focus->field#enter blur->field#leave compositionstart->field#startComposing compositionend->field#endComposing keydown.enter->field#breakLine:!composing:prevent keydown.esc->field#revert:!composing:prevent">大家好</div>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project")
          return projectOf({
            segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
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
  function isEnterTaken(init: KeyboardEventInit = {}): boolean {
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
      ...init,
    });
    field().dispatchEvent(enter);
    return enter.defaultPrevented;
  }

  // @behavior ED-031
  it("leaves Enter to an input method while it composes", async () => {
    const typed = vi.fn(() => true);
    document.execCommand = typed;

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
      typed.mock.calls,
    ]).toEqual([false, false, false, true, [["insertLineBreak"]]]);
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

  // @behavior ED-074
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
    ]).toEqual(["大家好", false, []]);
  });

  // @behavior ED-075
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
