// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composingOption } from "./field_controller";
import TimeFieldController from "./time_field_controller";

describe("TimeFieldController", () => {
  let application: Application;
  let execCommand: typeof document.execCommand;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const input = () => document.querySelector<HTMLInputElement>("input")!;
  const selection = () =>
    input().value.slice(input().selectionStart!, input().selectionEnd!);

  /** Clicks the field with the caret left at `at`, as a click places it. */
  function clickAt(at: number): void {
    input().focus();
    input().setSelectionRange(at, at);
    input().click();
  }

  function type(key: string): void {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  }

  beforeEach(async () => {
    document.body.innerHTML = `
      <input value="00:00:32.360" data-controller="time-field" data-action="click->time-field#choosePart keydown->time-field#typeDigit:!composing">
    `;
    // happy-dom leaves the browser's editing out; this types as it does, over the selection
    execCommand = document.execCommand;
    document.execCommand = (_command, _showUi, text = "") => {
      input().setRangeText(
        text,
        input().selectionStart!,
        input().selectionEnd!,
      );
      return true;
    };
    application = Application.start();
    application.registerActionOption("composing", composingOption);
    application.register("time-field", TimeFieldController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    document.execCommand = execCommand;
  });

  // @behavior ED-110
  it("selects the part of a time clicked", () => {
    clickAt(4);

    expect([input().selectionStart, input().selectionEnd]).toEqual([3, 5]);
  });

  // @behavior ED-111
  it("shifts digits into the chosen part and chooses the next once it is full", () => {
    clickAt(4);

    type("1");
    const afterOne = [input().value, selection()];
    type("0");

    expect([afterOne, input().value, selection()]).toEqual([
      ["00:01:32.360", "01"],
      "00:10:32.360",
      "32",
    ]);
  });
});
