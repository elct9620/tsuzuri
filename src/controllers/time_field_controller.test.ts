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

  const caret = () => input().selectionStart;

  /** Focuses the field with the caret at `at`, or with `at` to `end` selected. */
  function placeCaret(at: number, end = at): void {
    input().focus();
    input().setSelectionRange(at, end);
  }

  /** Presses `keys` in turn, and answers those the field leaves to the browser's own editing. */
  function type(...keys: string[]): string[] {
    return keys.filter((key) =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      ),
    );
  }

  /** Sends a clipboard event of `kind` carrying `text`, and answers what it carries after. */
  function sendClipboardEvent(kind: "paste" | "cut", text = ""): string {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    input().dispatchEvent(
      new ClipboardEvent(kind, {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
    return clipboardData.getData("text/plain");
  }

  beforeEach(async () => {
    document.body.innerHTML = `
      <input value="00:00:32.360" data-controller="time-field" data-action="keydown->time-field#typeKey:!composing paste->time-field#pasteTime cut->time-field#copySelection compositionstart->time-field#keepTime compositionend->time-field#restoreTime">
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

  // @behavior ED-108
  it("types each digit over the one at the caret, past the separators", () => {
    input().value = "00:00:00.000";
    placeCaret(3);

    type("1", "2", "3", "1", "1", "1");

    expect([input().value, caret()]).toEqual(["00:12:31.110", 11]);
  });

  // @behavior ED-111
  it("types over a selected time from where the selection starts", () => {
    placeCaret(0, 12);

    type("1");

    expect([input().value, selection(), caret()]).toEqual([
      "10:00:32.360",
      "",
      1,
    ]);
  });

  // @behavior ED-146
  it("carries a digit typed past its part's range", () => {
    input().value = "00:00:00.000";
    placeCaret(3);

    type("7");

    expect([input().value, caret()]).toEqual(["01:10:00.000", 4]);
  });

  // @behavior ED-147
  it("types nothing past the end of a time", () => {
    placeCaret(12);

    type("5");

    expect(input().value).toBe("00:00:32.360");
  });

  // @behavior ED-148
  it("hops the separator in front of the caret when one is typed", () => {
    placeCaret(2);

    type(":");

    expect([input().value, caret()]).toEqual(["00:00:32.360", 3]);
  });

  // @behavior ED-149
  it("steps back with Backspace and removes nothing with either key", () => {
    placeCaret(6);

    const keysLeft = type("Backspace", "Delete");

    expect([input().value, caret(), keysLeft]).toEqual(["00:00:32.360", 5, []]);
  });

  // @behavior ED-150
  it("ignores a key that is no part of a time", () => {
    placeCaret(3);

    const keysLeft = type("a", " ");

    expect([input().value, keysLeft]).toEqual(["00:00:32.360", []]);
  });

  // @behavior ED-153
  it("takes back what an input method composed once it ends", () => {
    placeCaret(3);

    input().dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    input().setRangeText("ㄅ", 3, 3, "end");
    input().dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "ㄅ" }),
    );

    expect([input().value, caret()]).toEqual(["00:00:32.360", 3]);
  });

  // @behavior ED-151
  it("puts a pasted time in place of the whole field and leaves out text that is no time", () => {
    placeCaret(3);

    sendClipboardEvent("paste", "00:01:02,500");
    sendClipboardEvent("paste", "abc");

    expect([input().value, selection()]).toEqual([
      "00:01:02.500",
      "00:01:02.500",
    ]);
  });

  // @behavior ED-152
  it("copies what is cut without removing it", () => {
    placeCaret(0, 12);

    const copied = sendClipboardEvent("cut");

    expect([copied, input().value]).toEqual(["00:00:32.360", "00:00:32.360"]);
  });
});
