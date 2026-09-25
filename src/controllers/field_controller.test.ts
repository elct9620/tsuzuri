// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FieldController, { composingOption } from "./field_controller";

describe("FieldController", () => {
  let application: Application;
  let changes: string[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const field = () => document.querySelector<HTMLElement>("[data-controller]")!;

  beforeEach(async () => {
    changes = [];
    document.body.innerHTML = `
      <div id="editor">
        <div contenteditable="plaintext-only" data-controller="field"
          data-action="focus->field#remember blur->field#leave keydown.enter->field#breakLine:!composing:prevent">大家好</div>
      </div>
    `;
    document
      .querySelector("#editor")!
      .addEventListener("field:change", (event) =>
        changes.push((event as CustomEvent<{ value: string }>).detail.value),
      );
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    application.register("field", FieldController);
    await settle();
  });

  afterEach(() => {
    application.stop();
  });

  // @behavior ED-029
  it("hands over nothing when left unchanged", () => {
    field().dispatchEvent(new FocusEvent("focus"));
    field().dispatchEvent(new FocusEvent("blur"));

    expect(changes).toEqual([]);
  });

  it("hands over its text when left changed", () => {
    field().dispatchEvent(new FocusEvent("focus"));
    field().textContent = "大家好啊";
    field().dispatchEvent(new FocusEvent("blur"));

    expect(changes).toEqual(["大家好啊"]);
  });

  /** Whether pressing Enter, while an input method composes or not, lets the field take the key. */
  function isEnterTaken(isComposing: boolean): boolean {
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing,
      cancelable: true,
    });
    field().dispatchEvent(enter);
    return enter.defaultPrevented;
  }

  // @behavior ED-031
  it("leaves Enter to an input method while it composes", () => {
    const typed = vi.fn(() => true);
    document.execCommand = typed;

    const taken = [isEnterTaken(true), isEnterTaken(false)];

    expect([taken, typed.mock.calls]).toEqual([
      [false, true],
      [["insertLineBreak"]],
    ]);
  });
});
