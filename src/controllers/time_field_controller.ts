import { Controller } from "@hotwired/stimulus";

import {
  caretPastSeparator,
  formatTime,
  parseTime,
  typedTime,
} from "../ui/time";

/** The keys that move the caret past a separator rather than type one. */
const SEPARATOR_KEYS = [":", ";", ".", ","];

/**
 * One time field of the editor, typed as Aegisub's time field is in its overwrite mode: a digit
 * overwrites the one at the caret, a separator typed moves past the one there, Backspace steps
 * back without removing anything, and no other key changes the text, so a time never loses its
 * shape. Typing goes through the browser's editing, so `change` still writes the time and undo
 * still takes it back.
 */
export default class TimeFieldController extends Controller<HTMLInputElement> {
  /** The time and caret an input method began composing over, put back once it ends. */
  private timeBeforeComposition = "";
  private caretBeforeComposition = 0;

  /** Keeps the time an input method is about to compose over; bound to `compositionstart`. */
  keepTime(): void {
    this.timeBeforeComposition = this.element.value;
    this.caretBeforeComposition = this.element.selectionStart ?? 0;
  }

  /** Takes back what an input method composed, so only the keys of a time change it; bound to `compositionend`. */
  restoreTime(): void {
    const caret = this.caretBeforeComposition;
    this.element.value = this.timeBeforeComposition;
    this.element.setSelectionRange(caret, caret);
  }

  /** Types a key into the time; bound to `keydown` with `:!composing`. */
  typeKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const { value } = this.element;
    const at = this.element.selectionStart ?? 0;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const typed = typedTime(value, at, event.key);
      if (typed) this.replaceTime(typed.time, typed.caret, typed.caret);
    } else if (SEPARATOR_KEYS.includes(event.key)) {
      event.preventDefault();
      const caret = caretPastSeparator(value, at);
      this.element.setSelectionRange(caret, caret);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      const caret = Math.max(at - 1, 0);
      this.element.setSelectionRange(caret, caret);
    } else if (event.key === "Delete" || event.key.length === 1) {
      event.preventDefault();
    }
  }

  /** Puts a pasted time in place of the whole field, selected; text that is no time is left out. */
  pasteTime(event: ClipboardEvent): void {
    event.preventDefault();
    const ms = parseTime(event.clipboardData?.getData("text/plain") ?? "");
    if (ms === null) return;
    const time = formatTime(ms);
    this.replaceTime(time, 0, time.length);
  }

  /** Copies the selection without removing it, as a time keeps every digit. */
  copySelection(event: ClipboardEvent): void {
    event.preventDefault();
    const { value, selectionStart, selectionEnd } = this.element;
    event.clipboardData?.setData(
      "text/plain",
      value.slice(selectionStart ?? 0, selectionEnd ?? 0),
    );
  }

  /** Writes `time` over the whole field through the browser's editing, then selects `start` to `end`. */
  private replaceTime(time: string, start: number, end: number): void {
    this.element.select();
    document.execCommand("insertText", false, time);
    this.element.setSelectionRange(start, end);
  }
}
