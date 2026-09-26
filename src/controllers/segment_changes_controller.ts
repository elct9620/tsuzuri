import { Controller } from "@hotwired/stimulus";

import { refreshProject } from "../backend/project";
import { isRun, type EditingSession, type SegmentChange } from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyEdit } from "../ui/notification";
import { parseTime } from "../ui/time";

function indexOf(element: EventTarget | null): number {
  return Number((element as HTMLElement).dataset.index);
}

/**
 * Changes the Segments themselves - their times, their number, which of them are one - from the
 * rows the transcript controller draws, and checks the rows a merge or a shift works on.
 */
export default class SegmentChangesController extends Controller {
  static targets = [
    "checked",
    "checkedCount",
    "merge",
    "shiftDialog",
    "offset",
  ];

  declare readonly session: EditingSession;
  /** The bar that shows while Segments are checked. */
  declare readonly checkedTarget: HTMLElement;
  declare readonly checkedCountTarget: HTMLElement;
  declare readonly mergeTarget: HTMLButtonElement;
  declare readonly shiftDialogTarget: HTMLDialogElement;
  /** Milliseconds to shift by, negative for earlier. */
  declare readonly offsetTarget: HTMLInputElement;

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
    await this.change({ kind: "deletion", index: indexOf(currentTarget) });
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
    this.checkedTarget.hidden = indexes.length === 0;
    this.checkedCountTarget.textContent = t("edit.selected", {
      count: indexes.length,
    });
    this.mergeTarget.disabled = !isRun(indexes);
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

  clearChecks(): void {
    this.session.uncheckAll();
  }

  private async change(change: SegmentChange): Promise<void> {
    notifyEdit(await this.session.change(change));
  }
}
