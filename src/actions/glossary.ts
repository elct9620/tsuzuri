/**
 * Adding a word to the Translation Glossary, which naming a Speaker and a field's right-click menu
 * share, and the right-click choice for the Glossary Mark the pointer stands on.
 */

import {
  type GlossaryMark,
  type GlossaryRow,
  type GlossaryTable,
  type Language,
  saveTranslationGlossary,
  translationGlossaryTable,
} from "#/ipc/project.ts";
import type { TextRange } from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import { attempt } from "#/state/notification.svelte.ts";
import type { GlossaryTerm, SegmentDialogs } from "#/state/context.ts";
import type { ChangeChoice } from "#/actions/segment-changes.ts";

/**
 * The rows of `table` with the term whose word in `language` is `word` passed through `change`,
 * that term added last when no row has the word.
 */
export function rowsWithTerm(
  table: GlossaryTable,
  language: Language,
  word: string,
  change: (row: GlossaryRow) => GlossaryRow = (row) => row,
): GlossaryRow[] {
  const column = table.languages.indexOf(language);
  const term = table.rows.find((row) => row.words[column] === word);
  if (term) return table.rows.map((row) => (row === term ? change(row) : row));
  const words = table.languages.map((_, at) => (at === column ? word : ""));
  return [...table.rows, change({ words, is_speaker: false })];
}

/** The Glossary Mark of `marks` that `range` stands within, if any. */
export function markAt(
  marks: GlossaryMark[],
  range: TextRange,
): GlossaryMark | undefined {
  return marks.find(
    (mark) => mark.start <= range.start && range.end <= mark.end,
  );
}

/**
 * The right-click choice for `mark` in a field written in `language`: adding a candidate to the
 * Translation Glossary, or editing a term, in the glossary dialog at the term's row.
 */
export function glossaryChoice(
  mark: GlossaryMark,
  language: Language,
  dialogs: SegmentDialogs,
): ChangeChoice {
  const term: GlossaryTerm = { language, word: mark.word };
  if (mark.kind === "term")
    return {
      id: "editTerm",
      label: t("glossary.editTerm", { word: mark.word }),
      isEnabled: true,
      run: () => dialogs.openGlossary(term),
    };
  return {
    id: "addTerm",
    label: t("glossary.addTerm", { word: mark.word }),
    isEnabled: true,
    run: async () => {
      const isAdded = await attempt(t("glossary.termNotAdded"), async () =>
        saveTranslationGlossary(
          rowsWithTerm(await translationGlossaryTable(), language, mark.word),
        ),
      );
      if (isAdded) dialogs.openGlossary(term);
    },
  };
}
