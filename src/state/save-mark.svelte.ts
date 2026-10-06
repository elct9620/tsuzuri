/**
 * The Save Mark beside the Current Resource's name, which the resource bar draws and every edit
 * written shows.
 */

import { t } from "#/i18n.ts";

/** How long the Save Mark stays after the latest edit written. */
export const SAVE_MARK_MS = 1500;

/** How long the Save Mark takes to fade away, the `duration-200` of its transition. */
const LEAVING_MS = 200;

export class SaveMark {
  isShown = $state(false);
  /** Its words, written only while it shows, so a screen reader hears each save rather than words that never change. */
  label = $state("");
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #clearTimer: ReturnType<typeof setTimeout> | undefined;

  /** Shows the Save Mark for `SAVE_MARK_MS`, starting over while edits keep being written. */
  show(): void {
    clearTimeout(this.#hideTimer);
    clearTimeout(this.#clearTimer);
    this.label = t("edit.saved");
    this.isShown = true;
    this.#hideTimer = setTimeout(() => {
      this.isShown = false;
      this.#clearTimer = setTimeout(() => (this.label = ""), LEAVING_MS);
    }, SAVE_MARK_MS);
  }
}

export const saveMark = new SaveMark();
