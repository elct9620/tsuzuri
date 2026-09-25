// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createField } from "./field";
import { textRange } from "./highlight";

describe("highlight", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("covers the characters asked for, across the field's text nodes", () => {
    const field = createField("資料不");
    field.append(document.createTextNode("會上傳"));
    document.body.append(field);

    expect(textRange(field, 3, 4)?.toString()).toBe("會");
  });
});
