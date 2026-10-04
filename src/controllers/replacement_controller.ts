import { Controller } from "@hotwired/stimulus";

import { isMacOS } from "../backend/system";
import type { EditingSession } from "../editor";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";
import { isShortcut } from "../ui/shortcuts";
import {
  chosenTextField,
  offerTextFields,
  selectedText,
} from "../ui/text_fields";

/**
 * The replace dialog: what to find across the Current Resource's original or the translation it
 * shows, what to put in its place, and whether it is a regular expression, which Rust reads. It
 * keeps what was typed, so the same replacement is one Enter away the next time.
 */
export default class ReplacementController extends Controller {
  static targets = ["dialog", "pattern", "substitute", "field", "regexToggle"];

  declare readonly session: EditingSession;
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly patternTarget: HTMLInputElement;
  declare readonly substituteTarget: HTMLInputElement;
  /** The choices of the original and the translation shown. */
  declare readonly fieldTargets: HTMLInputElement[];
  declare readonly regexToggleTarget: HTMLInputElement;

  /** Opens the dialog; bound to `keydown@window`, it acts only on the replace shortcuts. */
  openByShortcut(event: KeyboardEvent): void {
    if (!isShortcut(event, "replace", isMacOS()) || this.dialogTarget.open)
      return;
    event.preventDefault();
    this.open();
  }

  /** Opens the dialog, looking for the range the Cursor selects, if any. */
  open(): void {
    const selection = selectedText(this.session.cursor);
    if (selection !== "") this.patternTarget.value = selection;
    offerTextFields(
      this.fieldTargets,
      Boolean(this.session.transcript?.shownTranslation),
    );
    this.substituteTarget.placeholder = t("replace.substituteNone");
    this.dialogTarget.showModal();
    this.patternTarget.focus();
    this.patternTarget.select();
  }

  /** Replaces every match as one change, keeping the dialog open when nothing is replaced. */
  async apply(): Promise<void> {
    const pattern = this.patternTarget.value;
    if (pattern === "") return;
    const field = chosenTextField(this.fieldTargets);
    const outcome = await this.session.replaceText(field, {
      pattern,
      substitute: this.substituteTarget.value,
      is_regex: this.regexToggleTarget.checked,
    });
    if (outcome.kind === "failed") {
      notifyFailure(t("replace.failed"), outcome.error);
      return;
    }
    if (outcome.count === 0) {
      notify({ title: t("replace.nothing"), kind: "warning" });
      return;
    }
    this.dialogTarget.close();
    notify({
      title: t("replace.done", { count: outcome.count }),
      kind: "success",
    });
  }
}
