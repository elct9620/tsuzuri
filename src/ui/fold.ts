/**
 * Lights a fold `button` while its part is folded away, as a toggle button is lit while it is on,
 * so the page shows what it is not showing.
 */
export function showFold(button: HTMLElement, isFolded: boolean): void {
  button.classList.toggle("btn-primary", isFolded);
  button.setAttribute("aria-pressed", String(isFolded));
}
