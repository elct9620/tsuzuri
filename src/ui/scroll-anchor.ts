/**
 * Keeping an element where it stands on screen while what is above it changes height, as a row
 * unfolding or folding up would otherwise push the row being looked at away.
 */

/**
 * The scroll position that keeps an element where it stood: its top moved from `topBefore` to
 * `topAfter` as the content above it changed, so the scroll moves by as much.
 */
export function anchoredScrollTop(
  scrollTop: number,
  topBefore: number,
  topAfter: number,
): number {
  return scrollTop + topAfter - topBefore;
}

/** The nearest element above `element` that scrolls its content vertically, or none. */
export function scrollingAncestor(element: Element): HTMLElement | null {
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    const { overflowY } = getComputedStyle(ancestor);
    if (overflowY === "auto" || overflowY === "scroll") return ancestor;
  }
  return null;
}
