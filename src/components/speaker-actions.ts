/**
 * Naming Speakers, which the Speaker dialog and each Segment's Speaker menu share: a new name is
 * offered to the Translation Glossary once it is written.
 */

import {
  type ProjectFeed,
  saveTranslationGlossary,
  translationGlossaryTable,
} from "#/backend/project.ts";
import type { Outcome } from "#/editor/index.ts";
import { t } from "#/i18n.ts";
import {
  type Notification,
  notify,
  notifyEdit,
  notifyFailure,
} from "#/ui/notification.svelte.ts";

/** Marks the term `name` in the Primary Language column as a Speaker, adding the term when the glossary has none. */
async function addSpeaker(feed: ProjectFeed, name: string): Promise<void> {
  try {
    const table = await translationGlossaryTable();
    const project = feed.project;
    const column = project ? table.languages.indexOf(project.language) : -1;
    const term = table.rows.find((row) => row.words[column] === name);
    const rows = term
      ? table.rows.map((row) =>
          row === term ? { ...row, is_speaker: true } : row,
        )
      : [
          ...table.rows,
          {
            words: table.languages.map((_, at) => (at === column ? name : "")),
            is_speaker: true,
          },
        ];
    await saveTranslationGlossary(rows);
    notify({ title: t("edit.speakerAdded", { name }), kind: "success" });
  } catch (error) {
    notifyFailure(t("edit.speakerNotAdded"), error);
  }
}

/** An offer to add the Speaker just named to the Translation Glossary, when it names none such. */
function speakerOffer(
  feed: ProjectFeed,
  name: string,
): Pick<Notification, "detail" | "action"> | undefined {
  const glossarySpeakers = feed.project?.translation_glossary?.speakers ?? [];
  if (name === "" || glossarySpeakers.includes(name)) return undefined;
  return {
    detail: t("edit.newSpeaker", { name }),
    action: {
      label: t("edit.addSpeaker"),
      run: () => void addSpeaker(feed, name),
    },
  };
}

/**
 * Says the Speaker `name` was written, offering the name to the Translation Glossary in a
 * Notification when it names none such, or why it was not.
 */
export function notifyNamed(
  feed: ProjectFeed,
  outcome: Outcome,
  name: string,
): void {
  const offer = speakerOffer(feed, name);
  if (outcome.kind !== "written" || !offer) {
    notifyEdit(outcome);
    return;
  }
  notify({ title: t("edit.saved"), kind: "success", ...offer });
}
