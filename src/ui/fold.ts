/**
 * Marks a fold `button` pressed while its part is folded away, its swap `icon` showing the way the
 * next press goes.
 */
export function showFold(
  button: HTMLElement,
  icon: HTMLElement,
  isFolded: boolean,
): void {
  icon.classList.toggle("swap-active", isFolded);
  button.setAttribute("aria-pressed", String(isFolded));
}
