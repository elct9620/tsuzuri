import { Controller } from "@hotwired/stimulus";

import {
  hasTraditionalChinese,
  type EditCommand,
  type ProjectView,
} from "../backend/project";
import {
  isTextField,
  type CleanupOutcome,
  type EditingSession,
} from "../editor";
import { t } from "../i18n";
import { closeMenu } from "../ui/menu";
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

/**
 * Cleans Simplified Chinese out of the `zh-TW` text: what the user marked, by shortcut or the Edit
 * menu, a Segment from its menu, or the Checked Segments from their bar. It is offered only where
 * the Current Resource shows a text in `zh-TW`.
 */
export default class CleanupController extends Controller {
  static targets = ["checkedButton", "segmentChoice"];

  declare readonly session: EditingSession;
  declare readonly checkedButtonTarget: HTMLButtonElement;
  /** The cleanup in each Segment's menu. */
  declare readonly segmentChoiceTargets: HTMLElement[];

  /** Ctrl/⌘+Shift+T where no menu takes it first; bound with `:prevent`. */
  cleanByShortcut(): void {
    void this.cleanMarked();
  }

  /** Clean Simplified Chinese chosen from the Edit menu; bound to `rust:edit-command`. */
  applyEditCommand({ detail: command }: CustomEvent<EditCommand>): void {
    if (command === "clean-simplified") void this.cleanMarked();
  }

  /** Cleans the Segment whose menu it was chosen from, named by the `index` param. */
  async cleanSegment({
    currentTarget,
    params,
  }: Event & { params: { index: number } }): Promise<void> {
    closeMenu(currentTarget);
    notifyCleanup(await this.session.cleanSegments([params.index]));
  }

  async cleanChecked(): Promise<void> {
    notifyCleanup(
      await this.session.cleanSegments(this.session.checkedIndexes),
    );
  }

  /** Offers a cleanup only while a text in `zh-TW` is shown; bound to `transcript:shown`. */
  follow({ detail }: CustomEvent<{ project: ProjectView | null }>): void {
    const isOffered = hasTraditionalChinese(detail.project);
    this.checkedButtonTarget.hidden = !isOffered;
    for (const choice of this.segmentChoiceTargets) choice.hidden = !isOffered;
  }

  /**
   * Leaves a field being typed in, so its text is written and shown cleaned, then cleans what is
   * marked; a dialog holding focus is doing something else, so nothing is cleaned.
   */
  private async cleanMarked(): Promise<void> {
    const field = document.activeElement;
    if (field?.closest("dialog[open]")) return;
    if (field instanceof HTMLElement && isTextField(field)) field.blur();
    notifyCleanup(await this.session.cleanSimplified());
  }
}
