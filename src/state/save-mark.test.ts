// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAVE_MARK_MS, SaveMark } from "#/state/save-mark.svelte.ts";

describe("SaveMark", () => {
  let mark: SaveMark;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mark = new SaveMark();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks an edit as saved", () => {
    mark.show();

    expect(mark.label).toBe("已存檔");
  });

  // @behavior IF-037
  it("lets the Save Mark go on its own", () => {
    mark.show();

    vi.advanceTimersByTime(SAVE_MARK_MS);

    expect(mark.isShown).toBe(false);
  });

  // @behavior IF-038
  it("keeps the Save Mark for a whole moment from the latest edit saved", () => {
    mark.show();
    vi.advanceTimersByTime(SAVE_MARK_MS - 100);

    mark.show();
    vi.advanceTimersByTime(SAVE_MARK_MS - 100);

    expect(mark.isShown).toBe(true);
  });

  it("takes its words away once it has faded", () => {
    mark.show();

    vi.runAllTimers();

    expect(mark.label).toBe("");
  });
});
