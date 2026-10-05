import { t } from "../i18n";

/** How long the Save Mark stays after the latest edit written. */
export const SAVE_MARK_MS = 1500;

/** How long the Save Mark takes to fade away, the `duration-200` of its transition. */
const LEAVING_MS = 200;

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows the Save Mark beside the Current Resource's name for `SAVE_MARK_MS`, starting over while
 * edits keep being written. Its words are written only while it shows, so a screen reader hears
 * each save rather than words that never change.
 */
export function showSaveMark(): void {
  const mark = document.querySelector<HTMLElement>("[data-save-mark]");
  const label = mark?.querySelector<HTMLElement>("[data-save-mark-label]");
  if (!mark || !label) return;
  clearTimeout(hideTimer);
  clearTimeout(clearTimer);
  label.textContent = t("edit.saved");
  mark.dataset.isShown = "";
  hideTimer = setTimeout(() => {
    delete mark.dataset.isShown;
    clearTimer = setTimeout(() => (label.textContent = ""), LEAVING_MS);
  }, SAVE_MARK_MS);
}
