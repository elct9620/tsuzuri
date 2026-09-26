/**
 * The editing session: the one Current Segment and Cursor, the Checked Segments, and every use case
 * that edits the Current Resource. It holds the Project only as the Transcripts it is handed, and
 * writes through the port it is given, so it depends on nothing outside the editor.
 */

import {
  NO_CURSOR,
  nextCursor,
  type Cursor,
  type CursorEvent,
  type CursorField,
  type TextRange,
} from "./cursor";
import { segmentCountAfter, splitPoint } from "./rules";
import type {
  Segment,
  SegmentChange,
  SegmentField,
  TranscriptView,
} from "./segment";

/** What the session needs of whoever holds the Project. */
export interface EditingPort {
  editSegment(index: number, field: SegmentField, value: string): Promise<void>;
  /** Gives each Segment at `indexes` the Speaker `speaker`, or none when it is empty, as one change. */
  setSpeakers(indexes: number[], speaker: string): Promise<void>;
  changeSegments(change: SegmentChange): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** How a use case ended, for the screen to tell the user. */
export type Outcome =
  | { kind: "written" }
  | { kind: "unchanged" }
  /** Refused before anything was sent: a split needs text on both sides of the Cursor. */
  | { kind: "refused" }
  | { kind: "failed"; error: unknown };

/** What a listener is told has changed: the Current Segment, the Cursor within it, or the checks. */
export type SessionChange = "current" | "cursor" | "checked";

/** A Segment Change sent and not yet seen in a Transcript, with the Segments it was made to. */
interface PendingChange {
  change: SegmentChange;
  before: Segment[];
}

/** The text or translation last entered, with the text it held, so leaving it unchanged writes nothing. */
interface EnteredField {
  index: number;
  field: CursorField;
  text: string;
}

export class EditingSession {
  private view: TranscriptView | null = null;
  private state: Cursor = NO_CURSOR;
  private checked = new Set<number>();
  private pending: PendingChange | null = null;
  private entered: EnteredField | null = null;
  private readonly listeners = new Set<(change: SessionChange) => void>();
  private readonly unannounced = new Set<SessionChange>();

  constructor(private readonly port: EditingPort) {}

  get cursor(): Cursor {
    return this.state;
  }

  /** The Checked Segments' positions, in order. */
  get checkedIndexes(): number[] {
    return [...this.checked].sort((one, other) => one - other);
  }

  /** The Transcript last followed, or none before the first. */
  get transcript(): TranscriptView | null {
    return this.view;
  }

  /** Calls `listener` with each change `announce` tells of, until the returned function is called. */
  onChange(listener: (change: SessionChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells the listeners what has changed since they were last told. */
  announce(): void {
    const changes = [...this.unannounced];
    this.unannounced.clear();
    for (const change of changes)
      for (const listener of this.listeners) listener(change);
  }

  /**
   * Takes the Transcript as the Project holds it now. A Segment Change that changes how many
   * Segments there are is applied on the first Transcript with as many as it leaves, so a text
   * written just before it is not taken for it; any other difference was made elsewhere. Nothing is
   * announced, so the screen can draw the Transcript before it hears of the Cursor.
   */
  follow(view: TranscriptView): void {
    const before = this.view;
    this.view = view;
    const pending = this.pending;
    if (
      pending &&
      view.segments.length ===
        segmentCountAfter(pending.change, pending.before.length)
    ) {
      this.pending = null;
      this.move({
        kind: "change",
        change: pending.change,
        before: pending.before,
      });
      // The screen gives this field focus before its controller hears of it, so it counts as entered now
      const { index, caret } = this.state;
      if (index !== null && caret?.kind === "live")
        this.entered = { index, field: caret.field, text: caret.text };
      this.clearChecks();
      return;
    }
    this.move({ kind: "view", before, after: view });
    const isSameShape =
      before !== null &&
      before.resource === view.resource &&
      before.segments.length === view.segments.length;
    if (!isSameShape) this.clearChecks();
  }

  /** Makes the Segment at `index` current as one of its fields gets focus, with a live caret in a text or a translation. */
  enter(
    index: number,
    field: CursorField | null,
    range: TextRange | null,
    text: string,
  ): void {
    if (field !== null) this.entered = { index, field, text };
    this.act({ kind: "enter", index, field, range, text });
  }

  /** Follows the live caret as the selection in its field moves or its text is typed. */
  select(
    index: number,
    field: CursorField,
    range: TextRange,
    text: string,
  ): void {
    if (this.holdsCaret(index, field))
      this.act({ kind: "select", range, text });
  }

  /**
   * Keeps the caret as focus leaves its field, and writes the field's text if it changed since it
   * was entered, even once the Cursor has moved on, so nothing typed is lost unsaid; a field left
   * after another was entered, such as one drawn away after a split, changes nothing.
   */
  async leave(
    index: number,
    field: CursorField,
    range: TextRange | null,
    text: string,
  ): Promise<Outcome> {
    if (this.holdsCaret(index, field)) this.act({ kind: "leave", range, text });
    return this.writeText(index, field, text);
  }

  /** Whether the live caret stands in `field` of the Segment at `index`. */
  private holdsCaret(index: number, field: CursorField): boolean {
    const { caret } = this.state;
    return (
      this.state.index === index &&
      caret?.kind === "live" &&
      caret.field === field
    );
  }

  makeCurrent(index: number): void {
    this.act({ kind: "make-current", index });
  }

  /** Writes a text, a translation or a Speaker of the Segment at `index`. */
  editText(
    index: number,
    field: SegmentField,
    value: string,
  ): Promise<Outcome> {
    return this.write(() => this.port.editSegment(index, field, value));
  }

  setSpeakers(indexes: number[], speaker: string): Promise<Outcome> {
    return this.write(() => this.port.setSpeakers(indexes, speaker));
  }

  /**
   * Makes a Segment Change to `before`, the Segments as the Project holds them. One that changes
   * how many Segments there are is noted before it is sent, so the Transcript that shows it moves
   * the Cursor; one that keeps their number never moves it, and clears the checks once written.
   */
  async change(
    change: SegmentChange,
    before: Segment[] = this.view?.segments ?? [],
  ): Promise<Outcome> {
    const isReshaping =
      segmentCountAfter(change, before.length) !== before.length;
    if (isReshaping) this.pending = { change, before };
    try {
      await this.port.changeSegments(change);
    } catch (error) {
      if (isReshaping) this.pending = null;
      return { kind: "failed", error };
    }
    if (!isReshaping) this.uncheckAll();
    return { kind: "written" };
  }

  /** Splits the Current Segment where the Cursor in its text starts, writing a text still being typed first. */
  async split(): Promise<Outcome> {
    const { index, caret } = this.state;
    if (index === null || caret?.field !== "text") return { kind: "refused" };
    const at = splitPoint(caret.text, caret.start);
    if (at === null) return { kind: "refused" };
    if (caret.kind === "live") {
      const written = await this.writeText(index, "text", caret.text);
      if (written.kind === "failed") return written;
    }
    const before = (this.view?.segments ?? []).map((segment, at) =>
      at === index ? { ...segment, text: caret.text } : segment,
    );
    return this.change({ kind: "split", index, at }, before);
  }

  undo(): Promise<Outcome> {
    return this.write(() => this.port.undo());
  }

  redo(): Promise<Outcome> {
    return this.write(() => this.port.redo());
  }

  /** Checks or unchecks the Segment at `index`. */
  check(index: number, isChecked: boolean): void {
    if (isChecked) this.checked.add(index);
    else this.checked.delete(index);
    this.unannounced.add("checked");
    this.announce();
  }

  clearChecks(): void {
    if (this.checked.size === 0) return;
    this.checked.clear();
    this.unannounced.add("checked");
  }

  /** Clears the checks and tells the listeners at once, as the user does. */
  uncheckAll(): void {
    this.clearChecks();
    this.announce();
  }

  /** Writes `text` into the field last entered, if it is `field` of the Segment at `index` and its text changed. */
  private async writeText(
    index: number,
    field: CursorField,
    text: string,
  ): Promise<Outcome> {
    const entered = this.entered;
    if (
      entered?.index !== index ||
      entered.field !== field ||
      entered.text === text
    )
      return { kind: "unchanged" };
    entered.text = text;
    return this.editText(index, field, text);
  }

  private async write(send: () => Promise<void>): Promise<Outcome> {
    try {
      await send();
      return { kind: "written" };
    } catch (error) {
      return { kind: "failed", error };
    }
  }

  /** Moves the Cursor as the user does, telling the listeners at once. */
  private act(event: CursorEvent): void {
    this.move(event);
    this.announce();
  }

  private move(event: CursorEvent): void {
    const next = nextCursor(this.state, event);
    if (next === this.state) return;
    if (next.index !== this.state.index) this.unannounced.add("current");
    this.state = next;
    this.unannounced.add("cursor");
  }
}
