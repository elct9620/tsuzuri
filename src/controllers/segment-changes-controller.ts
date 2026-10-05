import { Controller } from "@hotwired/stimulus";

import { type MenuChoice, popUpMenu } from "../backend/context-menu";
import {
  currentResource,
  type EditCommand,
  type ProjectFeed,
  type ProjectView,
} from "../backend/project";
import type { TranscriptionScope } from "../backend/transcription";
import { isMacOS } from "../backend/system";
import {
  isHeld,
  isRun,
  orderedTimes,
  runWithNeighbour,
  type MergeDirection,
  type TimeEdge,
  isTextField,
  type EditingSession,
  type Outcome,
  type SegmentChange,
} from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notify, notifyEdit } from "../ui/notification.svelte";
import { accelerator, isShortcut } from "../ui/shortcuts";
import { parseTime } from "../ui/time";

/**
 * Routes a key event by whether it was typed in a text field: `:typing` routes only those,
 * `:!typing` only the others, so a shortcut typed in a field stays the field's own.
 */
export function typingOption({
  event,
  value,
}: {
  event: Event;
  value: boolean;
}): boolean {
  return isTextField(event.target) === value;
}

function indexOf(element: EventTarget | null): number {
  return Number((element as HTMLElement).dataset.index);
}

/** Whether the user is working in an open dialog, a menu or a drop-down list, which Delete leaves alone. */
function isWorkingElsewhere(target: EventTarget | null): boolean {
  return (
    document.querySelector("dialog[open]") !== null ||
    (target instanceof Element && target.closest(".dropdown, select") !== null)
  );
}

/** The neighbour the merge shortcut `event` presses merges with, or none for another key. */
function mergeDirection(
  event: KeyboardEvent,
  isMac: boolean,
): MergeDirection | null {
  if (isShortcut(event, "mergeWithPrevious", isMac)) return "previous";
  if (isShortcut(event, "mergeWithNext", isMac)) return "next";
  return null;
}

/** `button` as a choice of a menu of the system: its text without the keys drawn beside it, and its shortcut. */
function choiceOf(button: HTMLButtonElement): MenuChoice {
  const shortcut = button.dataset.shortcut;
  return {
    text: button.firstChild?.textContent ?? "",
    isEnabled: !button.disabled,
    accelerator: shortcut ? accelerator(shortcut, isMacOS()) : undefined,
    run: () => button.click(),
  };
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
    "retranslateButton",
    "retranscribeButton",
    "shiftDialog",
    "offset",
  ];

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;
  /** The bar that shows while Segments are checked. */
  declare readonly checkedBarTarget: HTMLElement;
  declare readonly checkedCountTarget: HTMLElement;
  declare readonly mergeButtonTarget: HTMLButtonElement;
  /** Offered only while a translation is shown, the one it writes into. */
  declare readonly retranslateButtonTarget: HTMLButtonElement;
  /** Offered only for a Resource with a media file to transcribe. */
  declare readonly retranscribeButtonTarget: HTMLButtonElement;
  declare readonly shiftDialogTarget: HTMLDialogElement;
  /** Milliseconds to shift by, negative for earlier. */
  declare readonly offsetTarget: HTMLInputElement;
  /** A change by key is being sent. */
  private isChangingByKey = false;

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
      notify({ title: t("edit.unreadableTime"), kind: "warning" });
      await this.feed.refresh();
      return;
    }
    const edge = (currentTarget as HTMLElement).dataset.edge as TimeEdge;
    await this.change({
      kind: "times",
      index,
      ...orderedTimes(edge, start_ms, end_ms),
    });
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
   * `keydown@window` with `:!typing`.
   */
  async deleteByShortcut(event: KeyboardEvent): Promise<void> {
    if (
      !isShortcut(event, "delete", isMacOS()) ||
      isWorkingElsewhere(event.target)
    )
      return;
    const indexes = this.indexesToDelete;
    if (indexes.length === 0) return;
    await this.changeByKey(event, indexes, () =>
      this.session.change({ kind: "deletion", indexes }),
    );
  }

  /**
   * Merges the Current Segment with the one before or after it, as the key pressed tells; bound to
   * `keydown@window`, a text field included, as a merge needs no Cursor.
   */
  async mergeByShortcut(event: KeyboardEvent): Promise<void> {
    const direction = mergeDirection(event, isMacOS());
    const index = this.session.cursor.index;
    if (
      direction === null ||
      index === null ||
      event.isComposing ||
      isWorkingElsewhere(event.target)
    )
      return;
    const run = runWithNeighbour(index, direction, this.segmentCount);
    if (run === null) return;
    await this.changeByKey(event, [run.first, run.last], () =>
      this.session.merge(run.first, run.last),
    );
  }

  /** Splits the Segment whose menu was used where the Cursor in its text starts, which is kept while the menu has focus. */
  async split({ currentTarget }: Event): Promise<void> {
    closeMenu(currentTarget);
    notifyEdit(await this.session.split(), { refusal: "edit.splitWhere" });
  }

  /**
   * Opens what the row's menu offers, or what is offered for the Checked Segments while some are,
   * as a menu of the system beside the pointer; bound to `contextmenu` on a row.
   */
  async openMenu({ currentTarget, target }: Event): Promise<void> {
    const choiceSource =
      this.session.checkedIndexes.length > 0
        ? this.checkedBarTarget
        : (currentTarget as HTMLElement).querySelector(".change-menu")!;
    const buttons = [
      ...choiceSource.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((button) => !button.closest("[hidden]"));
    await popUpMenu(
      buttons.map(choiceOf),
      isTextField(target)
        ? { cut: t("edit.cut"), copy: t("edit.copy"), paste: t("edit.paste") }
        : null,
    );
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

  /** Merges the Segment whose menu was used with the one before it. */
  async mergeWithPrevious({ currentTarget }: Event): Promise<void> {
    await this.mergeFromMenu(currentTarget, "previous");
  }

  /** Merges the Segment whose menu was used with the one after it. */
  async mergeWithNext({ currentTarget }: Event): Promise<void> {
    await this.mergeFromMenu(currentTarget, "next");
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
    const offset = this.offsetTarget.valueAsNumber;
    if (Number.isNaN(offset)) {
      this.offsetTarget.reportValidity();
      return;
    }
    this.shiftDialogTarget.close();
    if (indexes.length === 0) return;
    await this.change({
      kind: "shift",
      first: indexes[0],
      last: indexes[indexes.length - 1],
      offset_ms: Math.round(offset),
    });
  }

  /** Offers translating and transcribing the Checked Segments again only where each can run; bound to `transcript:shown`. */
  followTasks({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    this.retranslateButtonTarget.hidden =
      (detail.project?.shown_translation ?? null) === null;
    this.retranscribeButtonTarget.hidden = !(
      currentResource(detail.project)?.has_media ?? false
    );
  }

  /** Hands the Checked Segments to the translate dialog to be translated again. */
  retranslate(): void {
    this.dispatch("retranslate", {
      detail: { indexes: this.session.checkedIndexes },
    });
  }

  /** Hands one Segment, from its menu, to the translate dialog to be translated again. */
  retranslateSegment({ currentTarget }: Event): void {
    closeMenu(currentTarget);
    this.dispatch("retranslate", {
      detail: { indexes: [indexOf(currentTarget)] },
    });
  }

  /** Hands the span the Checked Segments run over to the transcribe dialog. */
  retranscribe(): void {
    const indexes = this.session.checkedIndexes;
    const scope: TranscriptionScope = {
      kind: "span",
      first: Math.min(...indexes),
      last: Math.max(...indexes),
    };
    this.dispatch("retranscribe", { detail: { scope } });
  }

  /** Hands one Segment, from its menu, to the transcribe dialog to transcribe from it onward. */
  retranscribeRest({ currentTarget }: Event): void {
    closeMenu(currentTarget);
    const scope: TranscriptionScope = {
      kind: "rest",
      first: indexOf(currentTarget),
    };
    this.dispatch("retranscribe", { detail: { scope } });
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
    const checkedIndexes = this.session.checkedIndexes;
    if (checkedIndexes.length > 0) return checkedIndexes;
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

  private get segmentCount(): number {
    return this.session.transcript?.segments.length ?? 0;
  }

  /** Merges the Segment of the menu item `choice` with its neighbour in `direction`. */
  private async mergeFromMenu(
    choice: EventTarget | null,
    direction: MergeDirection,
  ): Promise<void> {
    closeMenu(choice);
    const run = runWithNeighbour(indexOf(choice), direction, this.segmentCount);
    if (run) notifyEdit(await this.session.merge(run.first, run.last));
  }

  /**
   * Sends a change to the Segments at `indexes` for a key pressed, taking the key from the page; a
   * repeat or a press while a change is sent is dropped, as the Current Segment moves only once
   * the change shows, and so is one a running Mode holds.
   */
  private async changeByKey(
    event: KeyboardEvent,
    indexes: number[],
    send: () => Promise<Outcome>,
  ): Promise<void> {
    event.preventDefault();
    if (event.repeat || this.isChangingByKey || this.isAnyHeld(indexes)) return;
    this.isChangingByKey = true;
    try {
      notifyEdit(await send());
    } finally {
      this.isChangingByKey = false;
    }
  }

  private async change(change: SegmentChange): Promise<void> {
    notifyEdit(await this.session.change(change));
  }
}
