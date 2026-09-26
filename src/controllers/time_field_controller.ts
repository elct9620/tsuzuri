import { Controller } from "@hotwired/stimulus";

import { timeParts } from "../ui/time";

/**
 * One time field of the editor, typed a part at a time: a click chooses the hours, minutes,
 * seconds or milliseconds under it, digits shift into the chosen part from the right, and the next
 * part is chosen once it is full. Typing goes through the browser's editing, so `change` still
 * writes the time.
 */
export default class TimeFieldController extends Controller<HTMLInputElement> {
  /** The digits typed into the part chosen, which begins at `partStart`. */
  private typedDigits = "";
  private partStart = -1;

  /** Chooses the part the caret was clicked into, leaving a range dragged over as it is. */
  choosePart(): void {
    const { selectionStart, selectionEnd, value } = this.element;
    if (selectionStart === null || selectionStart !== selectionEnd) return;
    const part = timeParts(value).find(
      ([start, end]) => start <= selectionStart && selectionStart <= end,
    );
    if (part) this.selectPart(part);
  }

  /** Shifts a digit into the chosen part; bound to `keydown` with `:!composing`. */
  typeDigit(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!/^\d$/.test(event.key)) return;
    const parts = timeParts(this.element.value);
    const index = parts.findIndex(
      ([start, end]) =>
        start === this.element.selectionStart &&
        end === this.element.selectionEnd,
    );
    if (index === -1) return;
    event.preventDefault();
    const [start, end] = parts[index];
    if (start !== this.partStart) this.typedDigits = "";
    this.typedDigits += event.key;
    const width = end - start;
    document.execCommand(
      "insertText",
      false,
      this.typedDigits.padStart(width, "0"),
    );
    // A full last part starts over, as it has no next part to move on to
    const isFull = this.typedDigits.length === width;
    const next = parts[index + 1];
    this.selectPart(
      isFull && next ? next : [start, end],
      isFull ? "" : this.typedDigits,
    );
  }

  /** Selects `part`, with `typedDigits` the digits already shifted into it. */
  private selectPart([start, end]: [number, number], typedDigits = ""): void {
    this.element.setSelectionRange(start, end);
    this.typedDigits = typedDigits;
    this.partStart = start;
  }
}
