// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  createField,
  fieldSelection,
  fieldValue,
  keepSelection,
  setFieldValue,
} from "./field";

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

  /** Selects the characters of `field` from `start` to `end`. */
  function select(field: HTMLElement, start: number, end = start): void {
    const range = document.createRange();
    range.setStart(field.firstChild!, start);
    range.setEnd(field.firstChild!, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  }

  // @behavior ED-030
  it("counts the characters before each end of the selection, the line break included", () => {
    const field = createField("你好\n世界");
    document.body.append(field);

    select(field, 1, 4);

    expect(fieldSelection(field)).toEqual({ start: 1, end: 4 });
  });

  // @behavior ED-042
  it("keeps its selection once the document's moves elsewhere", () => {
    const field = createField("你好世界");
    const menu = document.createElement("button");
    document.body.append(field, menu);
    select(field, 2);

    keepSelection(field);
    document.getSelection()!.selectAllChildren(menu);

    expect(fieldSelection(field)).toEqual({ start: 2, end: 2 });
  });

  // @behavior ED-044
  it("drops its kept selection once another text is written into it", () => {
    const field = createField("你好世界");
    document.body.append(field);
    select(field, 2);
    keepSelection(field);
    document.getSelection()!.removeAllRanges();

    setFieldValue(field, "你好世界");
    const unchanged = fieldSelection(field);
    setFieldValue(field, "今天天氣很好");

    expect([unchanged, fieldSelection(field)]).toEqual([
      { start: 2, end: 2 },
      { start: 6, end: 6 },
    ]);
  });

  it("puts the caret after its text when it never held the selection", () => {
    const field = createField("你好");
    document.body.append(field);

    expect(fieldSelection(field)).toEqual({ start: 2, end: 2 });
  });
});
