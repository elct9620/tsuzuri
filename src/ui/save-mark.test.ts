// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_MARK_MS, showSaveMark } from "#/ui/save-mark.ts";
import { SAVE_MARK, saveMark } from "#/ui/test-save-mark.ts";

describe("showSaveMark", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    document.body.innerHTML = SAVE_MARK;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks an edit as saved", () => {
    showSaveMark();

    expect(saveMark()).toBe("已存檔");
  });

  // @behavior IF-037
  it("lets the Save Mark go on its own", () => {
    showSaveMark();

    vi.advanceTimersByTime(SAVE_MARK_MS);

    expect(saveMark()).toBeUndefined();
  });

  // @behavior IF-038
  it("keeps the Save Mark for a whole moment from the latest edit saved", () => {
    showSaveMark();
    vi.advanceTimersByTime(SAVE_MARK_MS - 100);

    showSaveMark();
    vi.advanceTimersByTime(SAVE_MARK_MS - 100);

    expect(saveMark()).toBe("已存檔");
    expect(document.querySelectorAll("[data-save-mark]")).toHaveLength(1);
  });
});
