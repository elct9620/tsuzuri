import { Controller } from "@hotwired/stimulus";

import { refreshProject, type EditCommand } from "../backend/project";
import { isMacOS } from "../backend/system";
import {
  isHeld,
  isRun,
  isTextField,
  type EditingSession,
  type SegmentChange,
} from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyEdit } from "../ui/notification";
import { parseTime } from "../ui/time";

function indexOf(element: EventTarget | null): number {
  return Number((element as HTMLElement).dataset.index);
}

/** Whether `event` is a bare Delete, or Backspace on macOS, where the key labelled delete types it. */
function isDeleteKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
    return false;
  return event.key === "Delete" || (event.key === "Backspace" && isMacOS());
}

/** Whether the user is working in an open dialog, a menu or a drop-down list, which Delete leaves alone. */
function isWorkingElsewhere(target: EventTarget | null): boolean {
  return (
    document.querySelector("dialog[open]") !== null ||
    (target instanceof Element && target.closest(".dropdown, select") !== null)
  );
}

/**
 * Changes the Segments themselves - their times, their number, which of them are one - from the
 * rows the transcript controller draws, and checks the rows a merge or a shift works on.
 */
export default class SegmentChangesController extends Controller {
  static targets = [
    "checkedBar",
    "checkedCount",
    "mergeButton",
    "shiftDialog",
    "offset",
  ];

  declare readonly session: EditingSession;
  /** The bar that shows while Segments are checked. */
  declare readonly checkedBarTarget: HTMLElement;
  declare readonly checkedCountTarget: HTMLElement;
  declare readonly mergeButtonTarget: HTMLButtonElement;
  declare readonly shiftDialogTarget: HTMLDialogElement;
  /** Milliseconds to shift by, negative for earlier. */
  declare readonly offsetTarget: HTMLInputElement;
  /** A deletion by key is being sent. */
  private isDeleting = false;

  /**
   * Select All chosen from the Edit menu selects the text in focus, or else checks every Segment;
   * bound to `rust:edit-command`.
   */
  applyEditCommand({ detail: command }: CustomEvent<EditCommand>): void {
    if (command !== "select-all") return;
    if (isTextField(document.activeElement)) document.execCommand("selectAll");
    else this.checkAll();
  }

  async changeTimes({ currentTarget }: Event): Promise<void> {
    const index = indexOf(currentTarget);
    const time = (edge: string) =>
      parseTime(
        this.element.querySelector<HTMLInputElement>(
          `[data-index="${index}"][data-edge="${edge}"]`,
        )?.value ?? "",
      );
    const [start_ms, end_ms] = [time("start"), time("end")];
    if (start_ms === null || end_ms === null) {
      notify({ title: t("edit.unreadableTime"), kind: "error" });
      await refreshProject();
      return;
    }
    await this.change({ kind: "times", index, start_ms, end_ms });
  }

  async insertBefore({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    await this.change({
      kind: "insertion-before",
      index: indexOf(currentTarget),
    });
  }

  async insertAfter({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    await this.change({
      kind: "insertion-after",
      index: indexOf(currentTarget),
    });
  }

  async delete({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    await this.change({
      kind: "deletion",
      indexes: [indexOf(currentTarget)],
    });
  }

  /** Deletes the Checked Segments as one change. */
  async deleteChecked(): Promise<void> {
    await this.change({
      kind: "deletion",
      indexes: this.session.checkedIndexes,
    });
  }

  /**
   * Deletes the Checked Segments, or else the Current Segment, as one change; bound to
   * `keydown@window` with `:!typing`. A repeat or a press while a deletion is sent is dropped, as
   * the Current Segment moves only once the deletion shows.
   */
  async deleteByShortcut(event: KeyboardEvent): Promise<void> {
    if (!isDeleteKey(event) || isWorkingElsewhere(event.target)) return;
    const indexes = this.indexesToDelete;
    if (indexes.length === 0) return;
    event.preventDefault();
    if (event.repeat || this.isDeleting || this.isAnyHeld(indexes)) return;
    this.isDeleting = true;
    try {
      await this.change({ kind: "deletion", indexes });
    } finally {
      this.isDeleting = false;
    }
  }

  /** Splits the Segment whose menu was used where the Cursor in its text starts, which is kept while the menu has focus. */
  async split({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    notifyEdit(await this.session.split(), { refusal: "edit.splitWhere" });
  }

  check({ currentTarget }: Event): void {
    const check = currentTarget as HTMLInputElement;
    this.session.check(indexOf(check), check.checked);
  }

  /** Shows how many Segments are checked, offering a merge only for Segments next to each other. */
  showChecked(): void {
    const indexes = this.session.checkedIndexes;
    this.checkedBarTarget.hidden = indexes.length === 0;
    this.checkedCountTarget.textContent = t("edit.checkedCount", {
      count: indexes.length,
    });
    this.mergeButtonTarget.disabled = !isRun(indexes);
  }

  async merge(): Promise<void> {
    const indexes = this.session.checkedIndexes;
    await this.change({
      kind: "merge",
      first: indexes[0],
      last: indexes[indexes.length - 1],
    });
  }

  openShift(): void {
    this.offsetTarget.value = "0";
    this.shiftDialogTarget.showModal();
  }

  async shift(): Promise<void> {
    const indexes = this.session.checkedIndexes;
    this.shiftDialogTarget.close();
    await this.change({
      kind: "shift",
      first: indexes[0],
      last: indexes[indexes.length - 1],
      offset_ms: Math.round(Number(this.offsetTarget.value)),
    });
  }

  /** Hands the Checked Segments to be translated again. */
  retranslate(): void {
    this.dispatch("retranslate");
  }

  /** Hands the Checked Segments to the Speaker dialog. */
  openSpeakers(): void {
    this.dispatch("speakers");
  }

  /** Ctrl/⌘+A outside a text field; bound with `:!typing:prevent`. */
  checkAll(): void {
    this.session.checkAll();
  }

  clearChecks(): void {
    this.session.uncheckAll();
  }

  /** The Checked Segments, or else the Current Segment, or none. */
  private get indexesToDelete(): number[] {
    const checked = this.session.checkedIndexes;
    if (checked.length > 0) return checked;
    const current = this.session.cursor.index;
    return current === null ? [] : [current];
  }

  /** Whether a running Mode holds any Segment at `indexes`, as it holds their menus. */
  private isAnyHeld(indexes: number[]): boolean {
    const view = this.session.transcript;
    return (
      view !== null && indexes.some((index) => isHeld("other", view, index))
    );
  }

  private async change(change: SegmentChange): Promise<void> {
    notifyEdit(await this.session.change(change));
  }
}
