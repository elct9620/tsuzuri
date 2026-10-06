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
  CleanupScope,
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
  /** Cleans Simplified Chinese out of the `zh-TW` text within `scope`, answering how many characters changed. */
  cleanSimplified(scope: CleanupScope): Promise<number>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** A use case Rust refused or could not carry out, and why. */
type FailedOutcome = { kind: "failed"; error: unknown };

/** How a use case ended, for the screen to tell the user. */
export type Outcome =
  | { kind: "written" }
  | { kind: "unchanged" }
  /** Refused before anything was sent: a split needs text on both sides of the Cursor. */
  | { kind: "refused" }
  | FailedOutcome;

/** How a replacement ended: how many matches were replaced, none when nothing matched. */
export type ReplacementOutcome =
  { kind: "replaced"; count: number } | FailedOutcome;

/** How a Simplified Cleanup ended: how many characters changed, or refused with no Segment to clean. */
export type CleanupOutcome =
  { kind: "cleaned"; count: number } | { kind: "refused" } | FailedOutcome;

/**
 * What a listener is told has changed; a `choice` is the user making another Segment current, as a
 * Segment Change moving the Current Segment is not.
 */
export type SessionChange = "cursor" | "choice" | "checks";

/**
 * Where the user chose another Segment from, which tells how much of the listening they mean to
 * leave: its text or translation, a time of it, its Speaker menu, anywhere else in its row or the
 * keyboard's focus reaching it, Enter moving on from the field before, its region, or a search.
 */
export type ChoiceSource =
  "text" | "time" | "speaker" | "row" | "next" | "region" | "search";

/**
 * A text or a translation as it read when entered, kept past the Cursor so typing done before a
 * Mode took the Cursor is still written as the field is left.
 */
interface FieldEntry {
  index: number;
  field: CursorField;
  text: string;
}

/**
 * A Segment Change that changes the Segments' number, sent and not yet seen in a Transcript, with
 * the Segments it was made to.
 */
interface PendingChange {
  change: SegmentChange;
  before: Segment[];
}

export class EditingSession {
  private view: TranscriptView | null = null;
  private state: Cursor = NO_CURSOR;
  private checks = new Set<number>();
  private pendingChange: PendingChange | null = null;
  /** The field last entered, so leaving it unchanged writes nothing and Esc puts its text back. */
  private fieldEntry: FieldEntry | null = null;
  /** Where the choice being made is made from, as the one making it says. */
  private source: ChoiceSource | null = null;
  /** Where in a row the pointer pressed, for the choice that press makes. */
  private pointedSource: ChoiceSource | null = null;
  /** The write of the field last left, which a cleanup waits for before reading the Cursor it left. */
  private leavingWrite: Promise<Outcome> = Promise.resolve({
    kind: "unchanged",
  });
  private readonly listeners = new Set<(change: SessionChange) => void>();
  private readonly unannouncedChanges = new Set<SessionChange>();

  constructor(private readonly port: EditingPort) {}

  get cursor(): Cursor {
    return this.state;
  }

  /**
   * Where the Segment a `choice` tells of was chosen from, read while it is being told: where the
   * one making it says, else where the pointer pressed, else the row, as the keyboard's focus is.
   */
  get choiceSource(): ChoiceSource {
    return this.source ?? this.pointedSource ?? "row";
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
   * Takes the Transcript as the Project holds it now. A pending Segment Change is applied on the
   * first Transcript with as many Segments as it leaves, so a text written just before it is not
   * taken for it. Any other difference was made elsewhere. Nothing is announced, so the screen can
   * draw the Transcript before it hears of the Cursor.
   */
  follow(view: TranscriptView): void {
    const before = this.view;
    this.view = view;
    const pendingChange = this.pendingChange;
    if (
      pendingChange &&
      view.segments.length ===
        segmentCountAfter(pendingChange.change, pendingChange.before.length)
    ) {
      this.pendingChange = null;
      this.move({
        kind: "change",
        change: pendingChange.change,
        before: pendingChange.before,
        after: view.segments,
      });
      this.enterCaretLeftByChange();
      this.clearChecks();
      return;
    }
    this.move({ kind: "view", before, after: view });
    const isSameShape =
      before !== null &&
      before.resource === view.resource &&
      before.segments.length === view.segments.length;
    if (!isSameShape) {
      this.fieldEntry = null;
      this.clearChecks();
    }
  }

  /**
   * Takes a live caret a Segment Change leaves as entering its text, since that text may get focus
   * before it can say so, as a row just drawn does; without one, no field stays entered, since the
   * change may have moved it.
   */
  private enterCaretLeftByChange(): void {
    const { index, caret } = this.state;
    this.fieldEntry =
      index !== null && caret?.kind === "live"
        ? { index, field: caret.field, text: caret.text }
        : null;
  }

  /** Makes the Segment at `index` current as one of its fields gets focus, with a live caret in a text or a translation. */
  enter(
    index: number,
    field: CursorField | null,
    range: TextRange | null,
    text: string,
  ): void {
    if (field !== null) this.fieldEntry = { index, field, text };
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
   * Keeps the caret as focus leaves its field, and writes the field's text if it changed since it
   * was entered, even once a Mode has taken the Cursor. A field other than the one last entered,
   * such as one drawn away after a split, changes nothing.
   */
  async leave(
    index: number,
    field: CursorField,
    range: TextRange | null,
    text: string,
  ): Promise<Outcome> {
    if (this.hasLiveCaret(index, field))
      this.act({ kind: "exit", range, text });
    this.leavingWrite = this.writeText(index, field, text);
    return this.leavingWrite;
  }

  /**
   * Gives up the typing in `field` of the Segment at `index`, dropping the live caret there so
   * leaving the field keeps no Cursor; answers the text the field was entered with, which put back
   * makes leaving it write nothing, or none unless the live caret stands there.
   */
  revert(index: number, field: CursorField): string | null {
    if (!this.hasLiveCaret(index, field)) return null;
    this.act({ kind: "reversion" });
    return this.fieldEntry?.text ?? null;
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

  /** Makes the Segment at `index` current, as chosen from `source`, or else from where the pointer pressed. */
  makeCurrent(index: number, source?: ChoiceSource): void {
    const choose = () => this.act({ kind: "current-segment", index });
    if (source) this.chooseFrom(source, choose);
    else choose();
  }

  /**
   * Takes the choice a press of the pointer goes on to make, as focus moves or the press ends in a
   * click, as made from `source`, until that choice is made or the pointer is released.
   */
  pointAt(source: ChoiceSource): void {
    this.pointedSource = source;
  }

  releasePointer(): void {
    this.pointedSource = null;
  }

  /**
   * Runs `choose`, telling a Segment it makes current as chosen from `source`; Enter moves on by
   * focusing the next field, which enters it as any focus does.
   */
  chooseFrom(source: ChoiceSource, choose: () => void): void {
    this.source = source;
    try {
      choose();
    } finally {
      this.source = null;
    }
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

  replaceText(
    field: CursorField,
    replacement: Replacement,
  ): Promise<ReplacementOutcome> {
    return outcomeOf(
      () => this.port.replaceText(field, replacement),
      (count) => ({ kind: "replaced", count }),
    );
  }

  /**
   * Cleans Simplified Chinese out of what the user marked: the Checked Segments, else the range the
   * Cursor selects, else the Current Segment. A field just left is written first, so the range is
   * counted in the text the Project holds.
   */
  async cleanSimplified(): Promise<CleanupOutcome> {
    await this.leavingWrite;
    const checkedIndexes = this.checkedIndexes;
    if (checkedIndexes.length > 0) return this.cleanSegments(checkedIndexes);
    const { index, caret } = this.state;
    if (index === null) return { kind: "refused" };
    if (caret && caret.start !== caret.end)
      return this.clean({
        kind: "range",
        index,
        field: caret.field,
        start: Math.min(caret.start, caret.end),
        end: Math.max(caret.start, caret.end),
      });
    return this.cleanSegments([index]);
  }

  /** Cleans Simplified Chinese out of the Segments at `indexes`. */
  cleanSegments(indexes: number[]): Promise<CleanupOutcome> {
    return this.clean({ kind: "segments", indexes });
  }

  private clean(scope: CleanupScope): Promise<CleanupOutcome> {
    return outcomeOf(
      () => this.port.cleanSimplified(scope),
      (count) => ({ kind: "cleaned", count }),
    );
  }

  /**
   * Makes a Segment Change to `before`, the Segments as the Project holds them. One that changes
   * their number is noted before it is sent, so the Transcript that shows it moves the Cursor; one
   * that keeps it moves no row, so it clears the checks once written and waits for nothing.
   */
  async change(
    change: SegmentChange,
    before: Segment[] = this.view?.segments ?? [],
  ): Promise<Outcome> {
    const isReshaping =
      segmentCountAfter(change, before.length) !== before.length;
    if (isReshaping) this.pendingChange = { change, before };
    try {
      await this.port.changeSegments(change);
    } catch (error) {
      if (isReshaping) this.pendingChange = null;
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
      const writeResult = await this.writeText(index, "text", caret.text);
      if (writeResult.kind === "failed") return writeResult;
    }
    const before = (this.view?.segments ?? []).map((segment, at) =>
      at === index ? { ...segment, text: caret.text } : segment,
    );
    return this.change({ kind: "split", index, at }, before);
  }

  /** Merges the Segments `first` through `last`, writing a text still being typed in one of them first. */
  async merge(first: number, last: number): Promise<Outcome> {
    const { index, caret } = this.state;
    if (
      index !== null &&
      index >= first &&
      index <= last &&
      caret?.kind === "live"
    ) {
      const writeResult = await this.writeText(index, caret.field, caret.text);
      if (writeResult.kind === "failed") return writeResult;
    }
    return this.change({ kind: "merge", first, last });
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
    this.announceChecks();
  }

  /** Checks the Segments from `from` through `to`, either way round, and no others. */
  checkRange(from: number, to: number): void {
    this.checks.clear();
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++)
      this.checks.add(index);
    this.announceChecks();
  }

  /** Checks every Segment and tells the listeners at once, as the user does. */
  checkAll(): void {
    const count = this.view?.segments.length ?? 0;
    for (let index = 0; index < count; index++) this.checks.add(index);
    this.announceChecks();
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

  private announceChecks(): void {
    this.unannouncedChanges.add("checks");
    this.announce();
  }

  /** Writes `text` into `field` of the Segment at `index` if that is the field last entered and its text changed. */
  private async writeText(
    index: number,
    field: CursorField,
    text: string,
  ): Promise<Outcome> {
    const entry = this.fieldEntry;
    if (entry?.index !== index || entry.field !== field || entry.text === text)
      return { kind: "unchanged" };
    const previousText = entry.text;
    entry.text = text;
    const outcome = await this.editText(index, field, text);
    if (outcome.kind === "failed" && entry.text === text)
      entry.text = previousText;
    return outcome;
  }

  private write(send: () => Promise<void>): Promise<Outcome> {
    return outcomeOf(send, () => ({ kind: "written" }));
  }

  /** Moves the Cursor as the user does, telling the listeners at once. */
  private act(event: CursorEvent): void {
    const index = this.state.index;
    this.move(event);
    if (this.state.index === index) {
      this.announce();
      return;
    }
    this.unannouncedChanges.add("choice");
    this.announce();
    this.releasePointer();
  }

  private move(event: CursorEvent): void {
    const next = nextCursor(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.unannouncedChanges.add("cursor");
  }
}

/** What `send` came to, as `done` tells it, or that it failed and why. */
async function outcomeOf<T, O>(
  send: () => Promise<T>,
  done: (value: T) => O,
): Promise<O | FailedOutcome> {
  try {
    return done(await send());
  } catch (error) {
    return { kind: "failed", error };
  }
}
