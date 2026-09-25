/**
 * Marks stretches of a field's text through the CSS Custom Highlight API, which colours text
 * without changing it, so a field's value stays the subtitle's text. Where the platform has no
 * such API, nothing is marked.
 */

/** Whether the platform can mark text without changing it. */
export function hasHighlights(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/** The Range covering characters `start` to `end` of the field's text, counted in UTF-16 units. */
export function textRange(
  field: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let passed = 0;
  let hasStart = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!hasStart && start <= passed + length) {
      range.setStart(node, start - passed);
      hasStart = true;
    }
    if (hasStart && end <= passed + length) {
      range.setEnd(node, end - passed);
      return range;
    }
    passed += length;
  }
  return null;
}

/** Marks every range under `name`, replacing what was marked under it before. */
export function markRanges(name: string, ranges: Range[]): void {
  if (!hasHighlights()) return;
  if (ranges.length === 0) CSS.highlights.delete(name);
  else CSS.highlights.set(name, new Highlight(...ranges));
}
