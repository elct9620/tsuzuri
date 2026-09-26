// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { KeptCaret, LiveCaret } from "./cursor";
import { createField } from "./field";
import { drawCursor } from "./marks";

function fieldInHost(text: string): HTMLElement {
  const host = document.createElement("div");
  const field = createField(text);
  host.append(field);
  document.body.append(host);
  return field;
}

const caret = (
  kind: "live" | "kept",
  start: number,
  end = start,
): LiveCaret | KeptCaret => ({
  kind,
  field: "text",
  start,
  end,
  text: "你好世界",
});

const caretMarks = () => document.querySelectorAll(".cursor-caret");

describe("drawCursor", () => {
  afterEach(() => {
    drawCursor(null, null);
    document.body.innerHTML = "";
  });

  it("draws a blinking caret after the characters before it", () => {
    const field = fieldInHost("你好世界");

    drawCursor(field, caret("live", 2));

    expect([
      field.dataset.cursor,
      caretMarks().length,
      caretMarks()[0].classList.contains("animate-blink"),
    ]).toEqual(["2", 1, true]);
  });

  it("holds a kept caret still", () => {
    const field = fieldInHost("你好世界");

    drawCursor(field, caret("kept", 2));

    expect([
      field.hasAttribute("data-has-kept-cursor"),
      caretMarks()[0].classList.contains("animate-blink"),
    ]).toEqual([true, false]);
  });

  it("marks a range without a caret", () => {
    const field = fieldInHost("你好世界");

    drawCursor(field, caret("live", 1, 3));

    expect([field.dataset.cursor, caretMarks().length]).toEqual(["1-3", 0]);
  });

  it("takes the Cursor away from the field it was drawn in before", () => {
    const first = fieldInHost("你好世界");
    const second = fieldInHost("今天");
    drawCursor(first, caret("kept", 2));

    drawCursor(second, caret("live", 1));

    expect([
      first.dataset.cursor,
      caretMarks().length,
      second.dataset.cursor,
    ]).toEqual([undefined, 1, "1"]);
  });
});
