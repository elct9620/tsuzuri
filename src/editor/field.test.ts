// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  createField,
  fieldSelection,
  fieldValue,
  placeSelection,
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

  it("reads no selection while the document's is elsewhere", () => {
    const field = createField("你好");
    const menu = document.createElement("button");
    document.body.append(field, menu);

    document.getSelection()!.selectAllChildren(menu);

    expect(fieldSelection(field)).toBeNull();
  });

  it("selects by characters, a character beyond the first plane counting as one", () => {
    const field = createField("你😀好");
    document.body.append(field);

    placeSelection(field, { start: 2, end: 2 });

    expect([
      fieldSelection(field),
      document.getSelection()!.anchorOffset,
    ]).toEqual([{ start: 2, end: 2 }, 3]);
  });
});
