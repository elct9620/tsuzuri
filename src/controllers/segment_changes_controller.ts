import { Controller } from "@hotwired/stimulus";

import {
  changeSegments,
  refreshProject,
  type SegmentChange,
} from "../backend/project";
import { fieldSelection, fieldValue } from "../editor/field";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyFailure } from "../ui/notification";
import { parseTime } from "../ui/time";

function indexOf(element: EventTarget | null): number {
  return Number((element as HTMLElement).dataset.index);
}

/**
 * Changes the Segments themselves - their times, their number, which of them are one - from the
 * rows the transcript controller draws, and the selection of rows a merge or a shift works on.
 */
export default class SegmentChangesController extends Controller {
  static targets = [
    "selection",
    "selectionCount",
    "merge",
    "shiftDialog",
    "offset",
  ];

  /** The bar that shows while rows are selected. */
  declare readonly selectionTarget: HTMLElement;
  declare readonly selectionCountTarget: HTMLElement;
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

  /**
   * Splits where the selection in the Segment's text starts, whether it is chosen from the menu,
   * after the text was left, or by shortcut while typing, which leaves the text so its edit is written first.
   */
  async split({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const index = indexOf(currentTarget);
    const text = this.element.querySelector<HTMLElement>(
      `.field[data-index="${index}"][data-field="text"]`,
    );
    const at = text ? fieldSelection(text).start : 0;
    if (!text || at === 0 || at >= [...fieldValue(text)].length) {
      notify({ title: t("edit.splitWhere"), kind: "warning" });
      return;
    }
    text.blur();
    await this.change({ kind: "split", index, at });
  }

  /** Shows how many rows are selected, offering a merge only for rows next to each other. */
  showSelection(): void {
    const indexes = this.selectedIndexes();
    this.selectionTarget.hidden = indexes.length === 0;
    this.selectionCountTarget.textContent = t("edit.selected", {
      count: indexes.length,
    });
    const isRun = indexes.every(
      (index, position) =>
        position === 0 || index === indexes[position - 1] + 1,
    );
    this.mergeTarget.disabled = indexes.length < 2 || !isRun;
  }

  async merge(): Promise<void> {
    const indexes = this.selectedIndexes();
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
    const indexes = this.selectedIndexes();
    this.shiftDialogTarget.close();
    await this.change({
      kind: "shift",
      first: indexes[0],
      last: indexes[indexes.length - 1],
      offset_ms: Math.round(Number(this.offsetTarget.value)),
    });
    this.clearSelection();
  }

  /** Hands the Checked Segments to be translated again. */
  retranslate(): void {
    this.dispatch("retranslate", {
      detail: { indexes: this.selectedIndexes() },
    });
  }

  /** Hands the Checked Segments to the Speaker dialog. */
  openSpeakers(): void {
    this.dispatch("speakers", {
      detail: { indexes: this.selectedIndexes() },
    });
  }

  clearSelection(): void {
    for (const checkbox of this.checkboxes()) checkbox.checked = false;
    this.showSelection();
  }

  private selectedIndexes(): number[] {
    return this.checkboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => indexOf(checkbox))
      .sort((a, b) => a - b);
  }

  private checkboxes(): HTMLInputElement[] {
    return [
      ...this.element.querySelectorAll<HTMLInputElement>("input.selection"),
    ];
  }

  private async change(change: SegmentChange): Promise<void> {
    try {
      await changeSegments(change);
      notify({ title: t("edit.saved"), kind: "success" });
      this.clearSelection();
    } catch (error) {
      notifyFailure(t("edit.notSaved"), error);
    }
  }
}
