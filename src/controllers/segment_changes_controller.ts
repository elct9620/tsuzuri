import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

import { t } from "../i18n";
import { closeMenu } from "../menu";
import { notify, notifyFailure } from "../notification";
import { parseTime } from "../time";

/** A Segment Change as Rust takes it, by position. */
type SegmentChange =
  | { kind: "times"; index: number; start_ms: number; end_ms: number }
  | { kind: "insertion-before"; index: number }
  | { kind: "insertion-after"; index: number }
  | { kind: "deletion"; index: number }
  | { kind: "split"; index: number; at: number }
  | { kind: "merge"; first: number; last: number }
  | { kind: "shift"; first: number; last: number; offset_ms: number };

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
      await emit("project-changed");
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

  /** Splits where the cursor was left in the Segment's text, which keeps its place once the menu takes focus. */
  async split({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    const index = indexOf(currentTarget);
    const text = this.element.querySelector<HTMLTextAreaElement>(
      `textarea[data-index="${index}"][data-field="text"]`,
    );
    const at = [...(text?.value ?? "").slice(0, text?.selectionStart ?? 0)]
      .length;
    if (!text || at === 0 || at >= [...text.value].length) {
      notify({ title: t("edit.splitWhere"), kind: "warning" });
      return;
    }
    await this.change({ kind: "split", index, at });
  }

  /** Shows how many rows are selected, offering a merge only for rows next to each other. */
  showSelection(): void {
    const selected = this.selectedIndexes();
    this.selectionTarget.hidden = selected.length === 0;
    this.selectionCountTarget.textContent = t("edit.selected", {
      count: selected.length,
    });
    const isRun = selected.every(
      (index, position) =>
        position === 0 || index === selected[position - 1] + 1,
    );
    this.mergeTarget.disabled = selected.length < 2 || !isRun;
  }

  async merge(): Promise<void> {
    const selected = this.selectedIndexes();
    await this.change({
      kind: "merge",
      first: selected[0],
      last: selected[selected.length - 1],
    });
  }

  openShift(): void {
    this.offsetTarget.value = "0";
    this.shiftDialogTarget.showModal();
  }

  async shift(): Promise<void> {
    const selected = this.selectedIndexes();
    this.shiftDialogTarget.close();
    await this.change({
      kind: "shift",
      first: selected[0],
      last: selected[selected.length - 1],
      offset_ms: Math.round(Number(this.offsetTarget.value)),
    });
    this.clearSelection();
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
      await invoke("change_segments", { change });
      notify({ title: t("edit.saved"), kind: "success", key: "saved" });
      this.clearSelection();
    } catch (error) {
      notifyFailure(t("edit.notSaved"), error);
    }
  }
}
