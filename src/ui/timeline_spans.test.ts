// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../backend/preferences";
import {
  choiceLanding,
  landingSpan,
  regionLanes,
  snapTime,
} from "./timeline_spans";

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
  describe("choosing another Segment", () => {
    const landings = DEFAULT_PREFERENCES.choice_landings;
    const playing = { start: 1, clicked: 1.5, isPaused: false, landings };

    it("moves a paused media to where a region was clicked, else to the Segment's start", () => {
      const paused = { ...playing, isPaused: true, isPlayingAlone: false };

      expect([
        choiceLanding({ ...paused, source: "region" }),
        choiceLanding({ ...paused, source: "speaker" }),
      ]).toEqual([
        { at: 1.5, isPausing: false },
        { at: 1, isPausing: false },
      ]);
    });

    it("pauses a Segment chosen from its row or a search, plays on from a click, and stays for a Speaker or Enter", () => {
      const onward = { ...playing, isPlayingAlone: false };

      expect(
        (
          [
            "text",
            "time",
            "row",
            "search",
            "region",
            "speaker",
            "next",
          ] as const
        ).map((source) => choiceLanding({ ...onward, source })),
      ).toEqual([
        { at: 1, isPausing: true },
        { at: 1, isPausing: true },
        { at: 1, isPausing: true },
        { at: 1, isPausing: true },
        { at: 1.5, isPausing: false },
        { at: null, isPausing: false },
        { at: null, isPausing: false },
      ]);
    });

    it("lands as the Preferences set each Choice Source", () => {
      const onward = { ...playing, isPlayingAlone: false };
      const landingsOf = (is_pausing: boolean, is_from_start: boolean) => ({
        ...landings,
        row: { is_pausing, is_from_start },
        region: { is_pausing, is_from_start },
      });

      expect(
        [
          [false, false],
          [false, true],
          [true, false],
        ].flatMap(([isPausing, isFromStart]) =>
          (["row", "region"] as const).map((source) =>
            choiceLanding({
              ...onward,
              source,
              landings: landingsOf(isPausing, isFromStart),
            }),
          ),
        ),
      ).toEqual([
        { at: null, isPausing: false },
        { at: 1.5, isPausing: false },
        { at: 1, isPausing: false },
        { at: 1, isPausing: false },
        { at: null, isPausing: true },
        { at: 1.5, isPausing: true },
      ]);
    });

    it("plays the Segment chosen from its start while playing alone, however it was chosen", () => {
      const alone = { ...playing, isPlayingAlone: true };

      expect(
        (["row", "region", "speaker", "next"] as const).map(
          (source) => choiceLanding({ ...alone, source }).at,
        ),
      ).toEqual([1, 1, 1, 1]);
    });
  });
});
