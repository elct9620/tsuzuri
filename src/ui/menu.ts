/**
 * Closes the toolbar menu `item` was chosen from. A daisyUI dropdown shows its content only
 * while focus is within it, so moving focus out closes it, as a click elsewhere does.
 */
export function closeMenu(item: EventTarget | null): void {
  const menu = (item as HTMLElement | null)?.closest(".dropdown");
  const focusedElement = document.activeElement;
  if (
    menu &&
    focusedElement instanceof HTMLElement &&
    menu.contains(focusedElement)
  )
    focusedElement.blur();
}
