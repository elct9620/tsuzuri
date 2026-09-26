// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isHeld, isRun, segmentCountAfter, splitPoint } from "./rules";
import type { TranscriptView } from "./segment";

const view = (changes: Partial<TranscriptView>): TranscriptView => ({
  resource: "ep01",
  segments: [],
  shownTranslation: "en",
  runningMode: null,
  ...changes,
});

describe("rules", () => {
  it("merges only two or more Segments next to each other", () => {
    expect([isRun([0, 1]), isRun([0, 2]), isRun([1])]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("holds every field while transcribing, and only the translation written, or its chosen Segments, while translating", () => {
    const kinds = ["text", "translation", "other"] as const;
    const held = (runningMode: TranscriptView["runningMode"]) =>
      kinds.map((kind) => isHeld(kind, view({ runningMode }), 0));
    expect([
      held(null),
      held({ mode: "transcription" }),
      held({ mode: "translation", language: "en", indexes: null }),
      held({ mode: "translation", language: "ja", indexes: null }),
      held({ mode: "translation", language: "en", indexes: [0] }),
      held({ mode: "translation", language: "en", indexes: [1] }),
    ]).toEqual([
      [false, false, false],
      [true, true, true],
      [false, true, true],
      [false, false, true],
      [false, true, true],
      [false, false, true],
    ]);
  });

  it("splits only where text is left on both sides", () => {
    expect([
      splitPoint("你好世界", 0),
      splitPoint("你好世界", 2),
      splitPoint("你好世界", 4),
    ]).toEqual([null, 2, null]);
  });

  it("counts the Segments a change leaves", () => {
    expect([
      segmentCountAfter({ kind: "split", index: 0, at: 2 }, 3),
      segmentCountAfter({ kind: "deletion", indexes: [0] }, 3),
      segmentCountAfter({ kind: "merge", first: 0, last: 2 }, 3),
      segmentCountAfter({ kind: "times", index: 0, start_ms: 0, end_ms: 1 }, 3),
    ]).toEqual([4, 2, 1, 3]);
  });
});
