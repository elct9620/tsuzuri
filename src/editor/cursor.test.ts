// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { NO_CURSOR, nextCursor, type Cursor } from "./cursor";
import type { Segment, TranscriptView } from "./segment";

function segments(...texts: string[]): Segment[] {
  return texts.map((text, index) => ({
    start_ms: index * 1000,
    end_ms: (index + 1) * 1000,
    text,
  }));
}

function view(changes: Partial<TranscriptView> = {}): TranscriptView {
  return {
    resource: "ep01",
    segments: segments("你好世界", "今天", "天氣"),
    shownTranslation: null,
    runningMode: null,
    ...changes,
  };
}

const live: Cursor = {
  index: 0,
  caret: { kind: "live", field: "text", start: 2, end: 2, text: "你好世界" },
};
const kept: Cursor = {
  index: 0,
  caret: { kind: "kept", field: "text", start: 2, end: 2, text: "你好世界" },
};

describe("nextCursor", () => {
  it("makes a Segment current with a live caret when its text is entered", () => {
    expect(
      nextCursor(NO_CURSOR, {
        kind: "entry",
        index: 0,
        field: "text",
        range: { start: 2, end: 2 },
        text: "你好世界",
      }),
    ).toEqual(live);
  });

  it("makes a Segment current without a caret when a time of it is entered", () => {
    expect(
      nextCursor(kept, {
        kind: "entry",
        index: 1,
        field: null,
        range: null,
        text: "",
      }),
    ).toEqual({ index: 1, caret: null });
  });

  it("keeps the caret when a time of the Current Segment is entered", () => {
    expect(
      nextCursor(kept, {
        kind: "entry",
        index: 0,
        field: null,
        range: null,
        text: "",
      }),
    ).toBe(kept);
  });

  it("follows a live caret as the selection moves", () => {
    expect(
      nextCursor(live, {
        kind: "selection",
        range: { start: 1, end: 3 },
        text: "你好世界",
      }).caret,
    ).toMatchObject({ kind: "live", start: 1, end: 3 });
  });

  it("keeps the caret where it was left, with the text it was left in", () => {
    expect(
      nextCursor(live, {
        kind: "exit",
        range: null,
        text: "你好世界啊",
      }).caret,
    ).toEqual({
      kind: "kept",
      field: "text",
      start: 2,
      end: 2,
      text: "你好世界啊",
    });
  });

  it("drops the caret when another Segment is made current", () => {
    expect(nextCursor(kept, { kind: "current-segment", index: 1 })).toEqual({
      index: 1,
      caret: null,
    });
  });

  it("keeps the caret when its own Segment is made current again", () => {
    expect(nextCursor(kept, { kind: "current-segment", index: 0 })).toBe(kept);
  });
});

describe("nextCursor after a Segment Change", () => {
  const before = segments("你好世界", "今天", "天氣");
  const after = (cursor: Cursor, change: Parameters<typeof nextCursor>[1]) =>
    nextCursor(cursor, change);

  it("moves to the start of the second half of a split", () => {
    expect(
      after(kept, {
        kind: "change",
        change: { kind: "split", index: 0, at: 2 },
        before,
      }),
    ).toEqual({
      index: 1,
      caret: { kind: "live", field: "text", start: 0, end: 0, text: "世界" },
    });
  });

  it("moves into a Segment inserted above or below", () => {
    const current = { index: 1, caret: null };
    expect([
      after(current, {
        kind: "change",
        change: { kind: "insertion-before", index: 1 },
        before,
      }).index,
      after(current, {
        kind: "change",
        change: { kind: "insertion-after", index: 1 },
        before,
      }).index,
    ]).toEqual([1, 2]);
  });

  it("moves into a Segment drawn between others by its start", () => {
    expect(
      after(NO_CURSOR, {
        kind: "change",
        change: { kind: "insertion", start_ms: 1500, end_ms: 1800 },
        before,
      }),
    ).toEqual({
      index: 2,
      caret: { kind: "live", field: "text", start: 0, end: 0, text: "" },
    });
  });

  it("stays on its Segment when one before it is deleted", () => {
    expect(
      after(
        { index: 2, caret: null },
        { kind: "change", change: { kind: "deletion", indexes: [0] }, before },
      ).index,
    ).toBe(1);
  });

  it("moves to the next Segment when the current one is deleted, or the previous for the last", () => {
    const indexAfterDeleting = (index: number) =>
      after(
        { index, caret: null },
        {
          kind: "change",
          change: { kind: "deletion", indexes: [index] },
          before,
        },
      ).index;
    expect([indexAfterDeleting(1), indexAfterDeleting(2)]).toEqual([1, 1]);
  });

  it("moves past every Segment deleted with the current one, or back before them at the end", () => {
    const indexAfterDeleting = (index: number, indexes: number[]) =>
      after(
        { index, caret: null },
        { kind: "change", change: { kind: "deletion", indexes }, before },
      ).index;
    expect([
      indexAfterDeleting(0, [0, 1]),
      indexAfterDeleting(1, [1, 2]),
    ]).toEqual([0, 0]);
  });

  it("keeps no Current Segment once the only one is deleted", () => {
    expect(
      after(
        { index: 0, caret: null },
        {
          kind: "change",
          change: { kind: "deletion", indexes: [0] },
          before: segments("你好"),
        },
      ),
    ).toEqual(NO_CURSOR);
  });

  it("stands on the merged Segment, or stays on its own when merged ones come before it", () => {
    const merging = (index: number) =>
      after(
        { index, caret: null },
        {
          kind: "change",
          change: { kind: "merge", first: 0, last: 1 },
          before: segments("一", "二", "三", "四"),
        },
      ).index;
    expect([merging(1), merging(3)]).toEqual([0, 2]);
  });

  it("keeps the Cursor through a change of times", () => {
    expect(
      after(kept, {
        kind: "change",
        change: { kind: "times", index: 0, start_ms: 100, end_ms: 900 },
        before,
      }),
    ).toBe(kept);
  });
});

describe("nextCursor after a Transcript changed elsewhere", () => {
  it("keeps the Current Segment while the Segments keep their number", () => {
    const current = { index: 1, caret: null };
    expect(
      nextCursor(current, {
        kind: "view",
        before: view(),
        after: view({ segments: segments("你好", "今天", "天氣") }),
      }),
    ).toBe(current);
  });

  it("drops everything when the Segments change in number or the Resource changes", () => {
    const current = { index: 1, caret: null };
    expect([
      nextCursor(current, {
        kind: "view",
        before: view(),
        after: view({ segments: segments("一", "二", "三", "四") }),
      }),
      nextCursor(current, {
        kind: "view",
        before: view(),
        after: view({ resource: "ep02" }),
      }),
    ]).toEqual([NO_CURSOR, NO_CURSOR]);
  });

  it("keeps a kept caret while its text stays, and drops it once the text is replaced", () => {
    expect([
      nextCursor(kept, { kind: "view", before: view(), after: view() }),
      nextCursor(kept, {
        kind: "view",
        before: view(),
        after: view({ segments: segments("今天天氣很好", "今天", "天氣") }),
      }),
    ]).toEqual([kept, { index: 0, caret: null }]);
  });

  it("drops the caret once a Mode holds its field", () => {
    expect(
      nextCursor(kept, {
        kind: "view",
        before: view(),
        after: view({ runningMode: { mode: "transcription" } }),
      }),
    ).toEqual({ index: 0, caret: null });
  });
});
