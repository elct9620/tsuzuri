// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeptCaret, LiveCaret } from "./cursor";
import { caretPlace, cursorMark } from "./marks";
import { fieldOf } from "./test-field";

function fieldInHost(text: string): HTMLElement {
  const host = document.createElement("div");
  const field = fieldOf(text);
  host.append(field);
  document.body.append(host);
  return field;
}

const caret = (start: number, end = start): LiveCaret | KeptCaret => ({
  kind: "live",
  field: "text",
  start,
  end,
  text: "你好世界",
});

describe("marks", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("says where a caret stands, or the range it covers", () => {
    expect([cursorMark(caret(2)), cursorMark(caret(1, 3))]).toEqual([
      "2",
      "1-3",
    ]);
  });

  it("places a caret beside the character it stands after, within the field's parent", () => {
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 30, y: 24, width: 0, height: 20 }),
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 10, y: 4, width: 200, height: 40 }),
    );

    expect(caretPlace(fieldInHost("你好世界"), caret(2))).toEqual({
      left: 20,
      top: 20,
      height: 20,
    });
  });

  it("places the caret of an empty field where its text would begin", () => {
    const field = fieldInHost("");
    field.style.padding = "4px 6px";
    field.style.lineHeight = "18px";

    expect(caretPlace(field, caret(0))).toEqual({
      left: 6,
      top: 4,
      height: 18,
    });
  });

  it("places no caret in a field without a parent", () => {
    expect(caretPlace(fieldOf("你好世界"), caret(2))).toBeNull();
  });
});
