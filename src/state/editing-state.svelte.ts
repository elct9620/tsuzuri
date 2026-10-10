/**
 * What the editing session tells of, kept as state the Svelte Components read: the Cursor, the
 * Checked Segments, and each Choice with where it was made from. The session announces only once
 * every Svelte Component has drawn the Project it follows, so what reads this draws after them.
 */

import {
  type ChoiceSource,
  type Cursor,
  type EditingSession,
  NO_CURSOR,
} from "#/editor/index.ts";

/** A Segment chosen, and where it was chosen from as the session told it. */
export interface Choice {
  source: ChoiceSource;
}

export class EditingState {
  cursor = $state.raw<Cursor>(NO_CURSOR);
  /** The Checked Segments' positions, in order. */
  checkedIndexes = $state.raw<number[]>([]);
  /** The latest Choice, a new one each time even when made from the same place; none before the first. */
  choice = $state.raw<Choice | null>(null);

  constructor(session: EditingSession) {
    session.onChange((change) => {
      if (change === "cursor") this.cursor = session.cursor;
      else if (change === "checks")
        this.checkedIndexes = session.checkedIndexes;
      else this.choice = { source: session.choiceSource };
    });
  }
}
