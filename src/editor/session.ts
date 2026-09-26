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
  Replacement,
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
  /** Replaces every match in `field` of each Segment as one change, answering how many there were. */
  replaceText(field: CursorField, replacement: Replacement): Promise<number>;
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

/** How a replacement ended: how many matches were replaced, none when nothing matched. */
export type ReplacementOutcome =
  { kind: "replaced"; count: number } | { kind: "failed"; error: unknown };

/**
 * What a listener is told has changed; a `choice` is the user making another Segment current, as a
 * Segment Change moving the Current Segment is not.
 */
export type SessionChange = "cursor" | "choice" | "checks";

/** A Segment Change sent and not yet seen in a Transcript, with the Segments it was made to. */
interface PendingChange {
  change: SegmentChange;
  before: Segment[];
}

function isSameSegments(one: Segment[], other: Segment[]): boolean {
  return JSON.stringify(one) === JSON.stringify(other);
}

export class EditingSession {
  private view: TranscriptView | null = null;
  private state: Cursor = NO_CURSOR;
  private checks = new Set<number>();
  private pendingChange: PendingChange | null = null;
  /** The text the live caret's field held when entered, so leaving it unchanged writes nothing and Esc puts it back. */
  private entryText = "";
  private readonly listeners = new Set<(change: SessionChange) => void>();
  private readonly unannouncedChanges = new Set<SessionChange>();

  constructor(private readonly port: EditingPort) {}

  get cursor(): Cursor {
    return this.state;
  }

  /** The Checked Segments' positions, in order. */
  get checkedIndexes(): number[] {
    return [...this.checks].sort((one, other) => one - other);
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
    const changes = [...this.unannouncedChanges];
    this.unannouncedChanges.clear();
    for (const change of changes)
      for (const listener of this.listeners) listener(change);
  }

  /**
   * Takes the Transcript as the Project holds it now. A Segment Change sent is applied on the first
   * Transcript that shows it: one with as many Segments as it leaves, differing from those it was
   * made to, so a text written just before it is not taken for it. Any other difference was made
   * elsewhere. Nothing is announced, so the screen can draw the Transcript before it hears of the Cursor.
   */
  follow(view: TranscriptView): void {
    const before = this.view;
    this.view = view;
    const pendingChange = this.pendingChange;
    if (pendingChange && this.isShown(pendingChange, view.segments)) {
      this.pendingChange = null;
      this.move({
        kind: "change",
        change: pendingChange.change,
        before: pendingChange.before,
        after: view.segments,
      });
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
    if (field !== null) this.entryText = text;
    this.act({ kind: "entry", index, field, range, text });
  }

  /** Follows the live caret as the selection in its field moves or its text is typed. */
  select(
    index: number,
    field: CursorField,
    range: TextRange,
    text: string,
  ): void {
    if (this.hasLiveCaret(index, field))
      this.act({ kind: "selection", range, text });
  }

  /**
   * Keeps the caret as focus leaves its field, and writes the field's text if it changed. A field
   * that does not hold the Cursor, such as one drawn away after a split, changes nothing.
   */
  async leave(
    index: number,
    field: CursorField,
    range: TextRange | null,
    text: string,
  ): Promise<Outcome> {
    if (!this.hasLiveCaret(index, field)) return { kind: "unchanged" };
    this.act({ kind: "exit", range, text });
    return this.writeText(index, field, text);
  }

  /**
   * Gives up the typing in `field` of the Segment at `index`, dropping the live caret there so
   * leaving the field keeps no Cursor and writes nothing; answers the text the field was entered
   * with, to put back, or none unless the live caret stands there.
   */
  revert(index: number, field: CursorField): string | null {
    if (!this.hasLiveCaret(index, field)) return null;
    this.act({ kind: "reversion" });
    return this.entryText;
  }

  /** Whether the live caret stands in `field` of the Segment at `index`. */
  private hasLiveCaret(index: number, field: CursorField): boolean {
    const { caret } = this.state;
    return (
      this.state.index === index &&
      caret?.kind === "live" &&
      caret.field === field
    );
  }

  makeCurrent(index: number): void {
    this.act({ kind: "current-segment", index });
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

  async replaceText(
    field: CursorField,
    replacement: Replacement,
  ): Promise<ReplacementOutcome> {
    try {
      return {
        kind: "replaced",
        count: await this.port.replaceText(field, replacement),
      };
    } catch (error) {
      return { kind: "failed", error };
    }
  }

  /**
   * Makes a Segment Change to `before`, the Segments as the Project holds them, noted before it is
   * sent so the Transcript that shows it moves the Cursor.
   */
  async change(
    change: SegmentChange,
    before: Segment[] = this.view?.segments ?? [],
  ): Promise<Outcome> {
    this.pendingChange = { change, before };
    try {
      await this.port.changeSegments(change);
      return { kind: "written" };
    } catch (error) {
      this.pendingChange = null;
      return { kind: "failed", error };
    }
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
    if (isChecked) this.checks.add(index);
    else this.checks.delete(index);
    this.unannouncedChanges.add("checks");
    this.announce();
  }

  /** Checks the Segments from `from` through `to`, either way round, and no others. */
  checkRange(from: number, to: number): void {
    this.checks.clear();
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++)
      this.checks.add(index);
    this.unannouncedChanges.add("checks");
    this.announce();
  }

  /** Checks every Segment and tells the listeners at once, as the user does. */
  checkAll(): void {
    const count = this.view?.segments.length ?? 0;
    for (let index = 0; index < count; index++) this.checks.add(index);
    this.unannouncedChanges.add("checks");
    this.announce();
  }

  clearChecks(): void {
    if (this.checks.size === 0) return;
    this.checks.clear();
    this.unannouncedChanges.add("checks");
  }

  /** Clears the checks and tells the listeners at once, as the user does. */
  uncheckAll(): void {
    this.clearChecks();
    this.announce();
  }

  /** Writes `text` into `field` of the Segment at `index` unless it is the text the field was entered with. */
  private async writeText(
    index: number,
    field: CursorField,
    text: string,
  ): Promise<Outcome> {
    if (text === this.entryText) return { kind: "unchanged" };
    this.entryText = text;
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

  private isShown(
    { change, before }: PendingChange,
    after: Segment[],
  ): boolean {
    return (
      after.length === segmentCountAfter(change, before.length) &&
      !isSameSegments(before, after)
    );
  }

  /** Moves the Cursor as the user does, telling the listeners at once. */
  private act(event: CursorEvent): void {
    const index = this.state.index;
    this.move(event);
    if (this.state.index !== index) this.unannouncedChanges.add("choice");
    this.announce();
  }

  private move(event: CursorEvent): void {
    const next = nextCursor(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.unannouncedChanges.add("cursor");
  }
}
