/** Where `showSaveMark` marks a saved edit, for a test page to include. */
export const SAVE_MARK = `<span data-save-mark><span data-save-mark-label></span></span>`;

/** The words of the Save Mark while it shows, or none while it does not. */
export function saveMark(): string | undefined {
  const mark = document.querySelector<HTMLElement>("[data-save-mark]");
  if (!mark || !("isShown" in mark.dataset)) return undefined;
  return mark.textContent ?? "";
}
