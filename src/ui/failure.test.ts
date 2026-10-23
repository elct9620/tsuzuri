// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { failureMessage } from "#/ui/failure.ts";

describe("failureMessage", () => {
  // @behavior SR-024
  it("names the Segment a Script returned that breaks a rule", () => {
    const message = failureMessage({
      code: "script",
      failure: { kind: "unordered-times", number: 2 },
    });

    expect(message).toBe("腳本回傳的第 2 段開始早於前一段，沒有寫入");
  });

  it("carries the message a Script raised", () => {
    const message = failureMessage({
      code: "script",
      failure: { kind: "raised", message: "boom" },
    });

    expect(message).toBe("腳本執行失敗：boom");
  });
});
