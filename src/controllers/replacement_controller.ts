import { Controller } from "@hotwired/stimulus";

import type { CursorField, EditingSession } from "../editor";
import { t } from "../i18n";
import { notify, notifyFailure } from "../ui/notification";

/**
 * Whether `event` asks for the replace dialog: Ctrl+H, as subtitle editors bind it, or
 * ⌘+Option+F on macOS, where ⌘+H hides the app. Option changes the key typed, so F is read by
 * its place on the keyboard.
 */
function isReplaceShortcut(event: KeyboardEvent): boolean {
  const isCtrlH =
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "h";
  const isMetaOptionF =
    event.metaKey && event.altKey && !event.ctrlKey && event.code === "KeyF";
  return isCtrlH || isMetaOptionF;
}

/**
 * The replace dialog: what to find across the Current Resource's original or the translation it
 * shows, what to put in its place, and whether it is a regular expression, which Rust reads. It
 * keeps what was typed, so the same replacement is one Enter away the next time.
 */
export default class ReplacementController extends Controller {
  static targets = ["dialog", "pattern", "substitute", "field", "isRegex"];

  declare readonly session: EditingSession;
  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly patternTarget: HTMLInputElement;
  declare readonly substituteTarget: HTMLInputElement;
  /** The choices of the original and the translation shown. */
  declare readonly fieldTargets: HTMLInputElement[];
  declare readonly isRegexTarget: HTMLInputElement;

  /** Opens the dialog; bound to `keydown@window`, it acts only on the replace shortcuts. */
  openByShortcut(event: KeyboardEvent): void {
    if (!isReplaceShortcut(event) || this.dialogTarget.open) return;
    event.preventDefault();
    this.open();
  }

  /** Opens the dialog, looking for the range the Cursor selects, if any. */
  open(): void {
    const selection = this.selectedText;
    if (selection !== "") this.patternTarget.value = selection;
    const hasTranslation = Boolean(this.session.transcript?.shownTranslation);
    for (const choice of this.fieldTargets)
      choice.disabled = choice.value === "translation" && !hasTranslation;
    if (!this.fieldTargets.some((choice) => choice.checked && !choice.disabled))
      this.choose("text");
    this.substituteTarget.placeholder = t("replace.substituteNone");
    this.dialogTarget.showModal();
    this.patternTarget.focus();
    this.patternTarget.select();
  }

  /** Replaces every match as one change, keeping the dialog open when nothing is replaced. */
  async apply(): Promise<void> {
    const pattern = this.patternTarget.value;
    if (pattern === "") return;
    const field = (this.fieldTargets.find((choice) => choice.checked)?.value ??
      "text") as CursorField;
    const outcome = await this.session.replaceText(field, {
      pattern,
      substitute: this.substituteTarget.value,
      is_regex: this.isRegexTarget.checked,
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

  /** The text of the range the Cursor selects, empty for a caret or no Cursor. */
  private get selectedText(): string {
    const caret = this.session.cursor.caret;
    if (!caret || caret.start === caret.end) return "";
    return [...caret.text].slice(caret.start, caret.end).join("");
  }

  private choose(field: CursorField): void {
    for (const choice of this.fieldTargets)
      choice.checked = choice.value === field;
  }
}
