import { Controller } from "@hotwired/stimulus";

import { findText, type TextMatch } from "../backend/editing";
import type { ProjectFeed } from "../backend/project";
import { isMacOS } from "../backend/system";
import {
  markRanges,
  rangeOf,
  type CursorField,
  type EditingSession,
} from "../editor";
import { t } from "../i18n";
import { failureMessage } from "../ui/failure";
import { isShortcut } from "../ui/shortcuts";
import {
  chosenTextField,
  offerTextFields,
  selectedText,
} from "../ui/text-fields";

/** The highlight every match is marked under, and the one the current match is. */
const MATCH_HIGHLIGHT = "search-match";
const CURRENT_MATCH_HIGHLIGHT = "search-current";

/** How far `event` moves between matches: one on, one back, or 0 for any other key. */
function matchStep(event: KeyboardEvent): number {
  const isMac = isMacOS();
  if (isShortcut(event, "searchNext", isMac)) return 1;
  if (isShortcut(event, "searchPrevious", isMac)) return -1;
  return 0;
}

/**
 * The search bar: finds what is typed in the Current Resource's original or the translation it
 * shows, as Rust reads it, marks every match and moves from one to the next, making its Segment
 * current. It searches again whenever the Segments change while it is open.
 */
export default class SearchController extends Controller {
  static targets = ["bar", "pattern", "field", "regexToggle", "count"];

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;
  declare readonly barTarget: HTMLElement;
  declare readonly patternTarget: HTMLInputElement;
  /** The choices of the original and the translation shown. */
  declare readonly fieldTargets: HTMLInputElement[];
  declare readonly regexToggleTarget: HTMLInputElement;
  /** Which match is current out of how many, or why nothing is found. */
  declare readonly countTarget: HTMLElement;

  private matches: TextMatch[] = [];
  private currentPosition = 0;
  /** The search last asked for, so an answer to an older one is dropped. */
  private searchNumber = 0;

  disconnect(): void {
    this.unmark();
  }

  /** Opens the bar while a Project is open; bound to `keydown@window`, it acts only on the search shortcuts. */
  openByShortcut(event: KeyboardEvent): void {
    if (!isShortcut(event, "search", isMacOS()) || this.feed.project === null)
      return;
    event.preventDefault();
    this.open();
  }

  /** Moves between matches while the bar is open; bound to `keydown@window`. */
  moveByShortcut(event: KeyboardEvent): void {
    const step = matchStep(event);
    if (step === 0 || this.barTarget.hidden) return;
    event.preventDefault();
    this.moveBy(step);
  }

  /** Opens the bar looking for the range the Cursor selects, if any. */
  open(): void {
    const selection = selectedText(this.session.cursor);
    if (selection !== "") this.patternTarget.value = selection;
    offerTextFields(
      this.fieldTargets,
      Boolean(this.session.transcript?.shownTranslation),
    );
    this.barTarget.hidden = false;
    this.patternTarget.focus();
    this.patternTarget.select();
    void this.search();
  }

  /** Closes the bar and takes its marks away. */
  close(): void {
    this.barTarget.hidden = true;
    this.matches = [];
    this.unmark();
  }

  /** Looks for what is typed from the first match on. */
  async search(): Promise<void> {
    this.currentPosition = 0;
    await this.findMatches();
  }

  /** Moves to the next match, round to the first after the last. */
  next(): void {
    this.moveBy(1);
  }

  /** Moves to the previous match, round to the last before the first. */
  previous(): void {
    this.moveBy(-1);
  }

  /** Searches again while open, as the Segments change; bound to `transcript:shown`. */
  follow(): void {
    if (!this.barTarget.hidden) void this.findMatches();
  }

  private moveBy(step: number): void {
    if (this.barTarget.hidden || this.matches.length === 0) return;
    const count = this.matches.length;
    this.currentPosition = (this.currentPosition + step + count) % count;
    this.session.makeCurrent(
      this.matches[this.currentPosition].index,
      "search",
    );
    this.show();
  }

  private async findMatches(): Promise<void> {
    const searchNumber = ++this.searchNumber;
    const pattern = this.patternTarget.value;
    if (pattern === "") {
      this.matches = [];
      this.show();
      return;
    }
    try {
      const matches = await findText(this.field, {
        pattern,
        is_regex: this.regexToggleTarget.checked,
      });
      if (searchNumber !== this.searchNumber) return;
      this.matches = matches;
      this.currentPosition = Math.min(
        this.currentPosition,
        Math.max(matches.length - 1, 0),
      );
      this.show();
    } catch (error) {
      if (searchNumber !== this.searchNumber) return;
      this.matches = [];
      this.unmark();
      this.countTarget.textContent = failureMessage(error);
    }
  }

  /** Marks every match and the current one, and counts them. */
  private show(): void {
    const ranges = this.matches.map((match) => this.matchRange(match));
    markRanges(
      MATCH_HIGHLIGHT,
      ranges.filter((range): range is Range => range !== null),
    );
    const currentRange = ranges[this.currentPosition];
    markRanges(CURRENT_MATCH_HIGHLIGHT, currentRange ? [currentRange] : []);
    this.countTarget.textContent =
      this.matches.length === 0
        ? t("search.nothing")
        : `${this.currentPosition + 1}/${this.matches.length}`;
  }

  private unmark(): void {
    markRanges(MATCH_HIGHLIGHT, []);
    markRanges(CURRENT_MATCH_HIGHLIGHT, []);
  }

  /** The Range a match covers in its field, or none while its row is not drawn. */
  private matchRange({ index, start, end }: TextMatch): Range | null {
    const field = this.element.querySelector<HTMLElement>(
      `.field[data-index="${index}"][data-field="${this.field}"]`,
    );
    return field ? rangeOf(field, { start, end }) : null;
  }

  private get field(): CursorField {
    return chosenTextField(this.fieldTargets);
  }
}
