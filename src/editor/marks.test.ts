// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  // @behavior ED-122
  it("keeps the caret on its character as marks drawn above move the text", () => {
    const observers: { targets: Element[]; notify: () => void }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly watched: { targets: Element[]; notify: () => void };
        constructor(notify: () => void) {
          this.watched = { targets: [], notify };
          observers.push(this.watched);
        }
        observe(target: Element) {
          this.watched.targets.push(target);
        }
        disconnect() {}
      },
    );
    let textTop = 0;
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ x: 0, y: textTop, width: 0, height: 20 }),
    );
    const field = fieldInHost("你好世界");
    drawCursor(field, caret("live", 2));

    textTop = 24;
    for (const { targets, notify } of observers)
      if (targets.includes(field.parentElement!)) notify();

    expect((caretMarks()[0] as HTMLElement).style.top).toBe("24px");
  });
});
