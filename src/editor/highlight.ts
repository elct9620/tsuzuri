/**
 * Marks stretches of a field's text through the CSS Custom Highlight API, which colours text
 * without changing it, so a field's value stays the subtitle's text. Where the platform has no
 * such API, nothing is marked.
 */

/** Whether the platform can mark text without changing it. */
export function hasHighlights(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/** Where characters `start` to `end` of the field's text begin and end, counted in UTF-16 units. */
function textBounds(
  field: HTMLElement,
  start: number,
  end: number,
): StaticRangeInit | null {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let passedLength = 0;
  let startBound: { node: Node; offset: number } | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!startBound && start <= passedLength + length)
      startBound = { node, offset: start - passedLength };
    if (startBound && end <= passedLength + length)
      return {
        startContainer: startBound.node,
        startOffset: startBound.offset,
        endContainer: node,
        endOffset: end - passedLength,
      };
    passedLength += length;
  }
  return null;
}

/** The Range covering characters `start` to `end` of the field's text, counted in UTF-16 units. */
export function textRange(
  field: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const bounds = textBounds(field, start, end);
  if (!bounds) return null;
  const range = document.createRange();
  range.setStart(bounds.startContainer, bounds.startOffset);
  range.setEnd(bounds.endContainer, bounds.endOffset);
  return range;
}

/**
 * The same stretch as `textRange`, as a range the page does not keep up to date as it changes: for
 * marks drawn anew whenever their text changes, which would otherwise make every change of the page
 * update each of them.
 */
export function textStaticRange(
  field: HTMLElement,
  start: number,
  end: number,
): StaticRange | null {
  const bounds = textBounds(field, start, end);
  return bounds && new StaticRange(bounds);
}

/** The ranges each owner marks under each highlight name, so it changes its own alone. */
const rangesByOwnerByName = new Map<
  string,
  WeakMap<Element, AbstractRange[]>
>();

/**
 * Marks `ranges` under `name` in place of what `owner` marked there before, leaving every other
 * owner's ranges as they are, so a field redraws its own marks without the page redrawing all of
 * them. A name is marked either this way or by `markRanges`, never both.
 */
export function markOwnRanges(
  name: string,
  owner: Element,
  ranges: AbstractRange[],
): void {
  if (!hasHighlights()) return;
  let rangesByOwner = rangesByOwnerByName.get(name);
  if (!rangesByOwner) {
    rangesByOwner = new WeakMap();
    rangesByOwnerByName.set(name, rangesByOwner);
  }
  let highlight = CSS.highlights.get(name);
  for (const range of rangesByOwner.get(owner) ?? []) highlight?.delete(range);
  if (ranges.length > 0 && !highlight) {
    highlight = new Highlight();
    CSS.highlights.set(name, highlight);
  }
  for (const range of ranges) highlight?.add(range);
  rangesByOwner.set(owner, ranges);
}

/** Marks every range under `name`, replacing what was marked under it before. */
export function markRanges(name: string, ranges: Range[]): void {
  if (!hasHighlights()) return;
  if (ranges.length === 0) CSS.highlights.delete(name);
  else CSS.highlights.set(name, new Highlight(...ranges));
}
