/**
 * Cleaning Simplified Chinese out of the `zh-TW` text, which each Segment's menu, the checked bar,
 * the shortcut and the Edit menu share; each tells how it ended in a Notification.
 */

import {
  isTextField,
  type CleanupOutcome,
  type EditingSession,
} from "../editor";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification.svelte";

/** Tells how a cleanup ended: how many characters were cleaned, or why none were. */
function notifyCleanup(outcome: CleanupOutcome): void {
  if (outcome.kind === "refused") return;
  if (outcome.kind === "failed") {
    notifyFailure(t("cleanup.failed"), outcome.error);
    return;
  }
  if (outcome.count === 0) {
    notify({ title: t("cleanup.nothing"), kind: "warning" });
    return;
  }
  notify({
    title: t("cleanup.done", { count: outcome.count }),
    kind: "success",
  });
}

/** Cleans the Segments at `indexes`. */
export async function cleanSegments(
  session: EditingSession,
  indexes: number[],
): Promise<void> {
  notifyCleanup(await session.cleanSegments(indexes));
}

/**
 * Leaves a field being typed in, so its text is written and shown cleaned, then cleans what is
 * marked; a dialog holding focus is doing something else, so nothing is cleaned.
 */
export async function cleanMarked(session: EditingSession): Promise<void> {
  const field = document.activeElement;
  if (field?.closest("dialog[open]")) return;
  if (field instanceof HTMLElement && isTextField(field)) field.blur();
  notifyCleanup(await session.cleanSimplified());
}
