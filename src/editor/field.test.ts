// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { caretOffset, createField, fieldValue } from "./field";

describe("field", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // @behavior ED-028
  it("takes plain text only and keeps each line break", () => {
    const field = createField("第一行\n第二行");

    expect([field.getAttribute("contenteditable"), fieldValue(field)]).toEqual([
      "plaintext-only",
      "第一行\n第二行",
    ]);
  });

  // @behavior ED-030
  it("counts the characters before the caret, the line break included", () => {
    const field = createField("你好\n世界");
    document.body.append(field);
    const caret = document.createRange();
    caret.setStart(field.firstChild!, 4);
    caret.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(caret);

    expect(caretOffset(field)).toBe(4);
  });
});
