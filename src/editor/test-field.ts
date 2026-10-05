/** A field as the Segment rows draw one, for the editor's own tests. */

/** A field holding `value`, typed into as the rows' fields are. */
export function fieldOf(value: string): HTMLElement {
  const field = document.createElement("div");
  field.setAttribute("contenteditable", "plaintext-only");
  field.setAttribute("role", "textbox");
  field.setAttribute("aria-multiline", "true");
  field.textContent = value;
  return field;
}
