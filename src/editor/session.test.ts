// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Segment, SegmentChange, TranscriptView } from "./segment";
import {
  EditingSession,
  type EditingPort,
  type SessionChange,
} from "./session";

function segments(...texts: string[]): Segment[] {
  return texts.map((text, index) => ({
    start_ms: index * 1000,
    end_ms: (index + 1) * 1000,
    text,
  }));
}

function view(...texts: string[]): TranscriptView {
  return {
    resource: "ep01",
    segments: segments(...texts),
    shownTranslation: null,
    runningMode: null,
  };
}

/** A port that records what is sent, refusing it while `isRefusing`. */
class RecordingPort implements EditingPort {
  sent: unknown[] = [];
  isRefusing = false;

  private async send(call: unknown): Promise<void> {
    this.sent.push(call);
    if (this.isRefusing) throw new Error("refused");
  }
  editSegment(index: number, field: string, value: string) {
    return this.send({ edit: [index, field, value] });
  }
  setSpeakers(indexes: number[], speaker: string) {
    return this.send({ speakers: [indexes, speaker] });
  }
  changeSegments(change: SegmentChange) {
    return this.send(change);
  }
  undo() {
    return this.send("undo");
  }
  redo() {
    return this.send("redo");
  }
}

describe("EditingSession", () => {
  let port: RecordingPort;
  let session: EditingSession;
  let heard: SessionChange[];

  beforeEach(() => {
    port = new RecordingPort();
    session = new EditingSession(port);
    heard = [];
    session.onChange((change) => heard.push(change));
    session.follow(view("你好世界", "今天", "天氣"));
    session.announce();
    heard = [];
  });

  /** Enters the first Segment's text with the caret after `你好`. */
  function enterFirst(): void {
    session.enter(0, "text", { start: 2, end: 2 }, "你好世界");
  }

  it("writes nothing when a text is left as it was entered", async () => {
    enterFirst();

    expect([
      await session.leave(0, "text", null, "你好世界"),
      port.sent,
    ]).toEqual([{ kind: "unchanged" }, []]);
  });

  it("writes a text left changed, and keeps the caret where it was", async () => {
    enterFirst();

    const outcome = await session.leave(
      0,
      "text",
      { start: 3, end: 3 },
      "你好啊世界",
    );

    expect([outcome, port.sent, session.cursor.caret]).toEqual([
      { kind: "written" },
      [{ edit: [0, "text", "你好啊世界"] }],
      { kind: "kept", field: "text", start: 3, end: 3, text: "你好啊世界" },
    ]);
  });

  it("refuses a split with no text on one side of the Cursor", async () => {
    session.enter(0, "text", { start: 0, end: 0 }, "你好世界");

    expect([await session.split(), port.sent]).toEqual([
      { kind: "refused" },
      [],
    ]);
  });

  it("refuses a split with no Cursor", async () => {
    session.makeCurrent(1);

    expect(await session.split()).toEqual({ kind: "refused" });
  });

  it("writes a text still being typed before splitting it", async () => {
    enterFirst();
    session.select(0, "text", { start: 3, end: 3 }, "你好啊世界");

    await session.split();

    expect(port.sent).toEqual([
      { edit: [0, "text", "你好啊世界"] },
      { kind: "split", index: 0, at: 3 },
    ]);
  });

  it("moves the Cursor only once a Transcript shows the split, whichever comes first", async () => {
    enterFirst();
    await session.leave(0, "text", null, "你好世界");
    const split = session.split();
    session.follow(view("你好世界", "今天", "天氣"));
    const beforeShown = session.cursor.index;

    session.follow(view("你好", "世界", "今天", "天氣"));
    await split;

    expect([beforeShown, session.cursor]).toEqual([
      0,
      {
        index: 1,
        caret: { kind: "live", field: "text", start: 0, end: 0, text: "世界" },
      },
    ]);
  });

  it("waits past the Transcript of a text written before a split for the one that shows the split", async () => {
    enterFirst();
    session.select(0, "text", { start: 3, end: 3 }, "你好啊世界");

    await session.split();
    session.follow(view("你好啊世界", "今天", "天氣"));
    const afterEdit = session.cursor.index;
    session.follow(view("你好啊", "世界", "今天", "天氣"));

    expect([
      afterEdit,
      session.cursor.index,
      session.cursor.caret?.text,
    ]).toEqual([0, 1, "世界"]);
  });

  it("keeps the Cursor where it was when a split is refused", async () => {
    enterFirst();
    await session.leave(0, "text", null, "你好世界");
    port.isRefusing = true;

    const outcome = await session.split();
    session.follow(view("你好世界", "今天", "天氣"));

    expect([
      outcome.kind,
      session.cursor.index,
      session.cursor.caret?.start,
    ]).toEqual(["failed", 0, 2]);
  });

  it("tells of a Cursor moved by a Transcript only when asked to", () => {
    session.makeCurrent(2);
    heard = [];

    session.follow(view("一", "二"));
    const beforeAnnounced = [...heard];
    session.announce();

    expect([beforeAnnounced, heard]).toEqual([[], ["cursor"]]);
  });

  it("tells of a choice after the Cursor as the user makes another Segment current", () => {
    session.makeCurrent(1);

    expect(heard).toEqual(["cursor", "choice"]);
  });

  it("tells of no choice as the user enters a field of the Current Segment", () => {
    session.makeCurrent(1);
    heard = [];

    session.enter(1, "text", { start: 0, end: 0 }, "今天");

    expect(heard).toEqual(["cursor"]);
  });

  it("tells of no choice as a Segment Change moves the Current Segment", async () => {
    session.makeCurrent(0);
    heard = [];

    await session.change({ kind: "insertion-after", index: 0 });
    session.follow(view("你好世界", "", "今天", "天氣"));
    session.announce();

    expect(heard).toEqual(["cursor"]);
  });

  it("clears the checks once a Segment Change is shown", async () => {
    session.check(0, true);
    session.check(1, true);

    await session.change({ kind: "merge", first: 0, last: 1 });
    session.follow(view("你好世界今天", "天氣"));

    expect(session.checkedIndexes).toEqual([]);
  });

  it("keeps the checks while a Transcript changed elsewhere keeps its Segments' number", () => {
    session.check(2, true);
    session.check(0, true);

    session.follow(view("你好", "今天", "天氣"));

    expect(session.checkedIndexes).toEqual([0, 2]);
  });

  it("checks a run in place of the checks before it, and tells of it", () => {
    session.check(0, true);
    heard = [];

    session.checkRange(2, 1);

    expect([session.checkedIndexes, heard]).toEqual([[1, 2], ["checks"]]);
  });

  it("changes nothing as a field without the Cursor is left", async () => {
    enterFirst();

    const outcome = await session.leave(1, "text", null, "今天啊");

    expect([outcome, session.cursor.caret?.kind, port.sent]).toEqual([
      { kind: "unchanged" },
      "live",
      [],
    ]);
  });
});
