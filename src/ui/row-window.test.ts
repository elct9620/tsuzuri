// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { drawnRanges, rowOffsets, shiftedHeights } from "#/ui/row-window.ts";

describe("the rows drawn of a long list", () => {
  /** A hundred rows of 10 px each. */
  const offsets = rowOffsets(Array.from({ length: 100 }, () => 10));

  it("starts each row where the rows above it end", () => {
    expect(rowOffsets([10, 20, 5])).toEqual([0, 10, 30, 35]);
  });

  it("draws the rows within a view's height above and below the view", () => {
    expect(drawnRanges(offsets, { top: 500, height: 100 }, [])).toEqual([
      { start: 40, end: 71 },
    ]);
  });

  it("draws from the first row and up to the last one at either end of the list", () => {
    expect([
      drawnRanges(offsets, { top: 0, height: 100 }, []),
      drawnRanges(offsets, { top: 900, height: 100 }, []),
    ]).toEqual([[{ start: 0, end: 21 }], [{ start: 80, end: 100 }]]);
  });

  it("draws every row while the view has no height yet", () => {
    expect(drawnRanges(offsets, { top: 0, height: 0 }, [])).toEqual([
      { start: 0, end: 100 },
    ]);
  });

  it("draws a kept row apart from the view, and none past the list", () => {
    expect(
      drawnRanges(offsets, { top: 500, height: 100 }, [90, 2, 100]),
    ).toEqual([
      { start: 2, end: 3 },
      { start: 40, end: 71 },
      { start: 90, end: 91 },
    ]);
  });

  it("joins a kept row into the rows of the view where it meets them", () => {
    expect(drawnRanges(offsets, { top: 500, height: 100 }, [71, 45])).toEqual([
      { start: 40, end: 72 },
    ]);
  });

  it("draws nothing of an empty list", () => {
    expect(drawnRanges(rowOffsets([]), { top: 0, height: 100 }, [5])).toEqual(
      [],
    );
  });
});

describe("the heights kept as the rows change", () => {
  const isAlike = (a: string, b: string) => a === b;

  it("keeps the heights of the rows before and after a split, and forgets the two it made", () => {
    expect(
      shiftedHeights(
        [1, 2, 3],
        ["a", "bc", "d"],
        ["a", "b", "c", "d"],
        isAlike,
      ),
    ).toEqual([1, undefined, undefined, 3]);
  });

  it("keeps the heights of the rows around one deleted", () => {
    expect(
      shiftedHeights([1, 2, 3], ["a", "b", "c"], ["a", "c"], isAlike),
    ).toEqual([1, 3]);
  });

  it("matches no row twice where the lists begin and end alike", () => {
    expect(
      shiftedHeights([1, 2], ["a", "a"], ["a", "a", "a"], isAlike),
    ).toEqual([1, 2, undefined]);
  });
});
