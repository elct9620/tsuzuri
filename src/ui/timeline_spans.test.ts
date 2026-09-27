// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { landingSpan, regionLanes, snapTime } from "./timeline_spans";

describe("timeline spans", () => {
  const reach = {
    lowestStart: 0,
    highestStart: 10,
    highestEnd: 10,
    snapTimes: [4],
    snapDistance: 0.1,
  };

  it("snaps a time to the nearest one within reach, and leaves it where none is", () => {
    expect([snapTime(3.95, [4, 5], 0.1), snapTime(3.5, [4], 0.1)]).toEqual([
      4, 3.5,
    ]);
  });

  it("lands a dragged end on a time within reach, never before its start", () => {
    expect([
      landingSpan({ start: 2, end: 3.95 }, "end", reach),
      landingSpan({ start: 2, end: 1 }, "end", reach),
    ]).toEqual([
      { start: 2, end: 4 },
      { start: 2, end: 2 },
    ]);
  });

  it("moves a whole span by the nearer snap of its edges, keeping its length", () => {
    expect(landingSpan({ start: 1.95, end: 3.5 }, undefined, reach)).toEqual({
      start: 1.95,
      end: 3.5,
    });
    expect(landingSpan({ start: 2.5, end: 3.95 }, undefined, reach)).toEqual({
      start: 2.55,
      end: 4,
    });
  });

  it("lays overlapping spans in Lanes and gives one overlapping none a Lane to itself", () => {
    expect(
      regionLanes([
        { start: 0, end: 2 },
        { start: 1, end: 3 },
        { start: 5, end: 6 },
      ]),
    ).toEqual([
      { index: 0, count: 2 },
      { index: 1, count: 2 },
      { index: 0, count: 1 },
    ]);
  });
});
