/**
 * Which rows of a long list are drawn: those within a screen of the view, and the ones kept drawn
 * wherever the list is scrolled, as a row being typed in is. A row's height is known once it has
 * been drawn and estimated until then; the rules hold without a page, so the list draws them.
 */

/** A run of rows drawn together, from `start` up to but not including `end`. */
export interface RowRange {
  start: number;
  end: number;
}

/** What of the list shows: how far it is scrolled past the first row, and how tall the view is, in pixels. */
export interface ListView {
  top: number;
  height: number;
}

/** Where each row starts, in pixels from the first, and where the last one ends. */
export function rowOffsets(heights: number[]): number[] {
  const offsets = [0];
  for (const height of heights)
    offsets.push(offsets[offsets.length - 1] + height);
  return offsets;
}

/** The row standing at `y` pixels from the first, the first or last one beyond either end. */
function rowAt(offsets: number[], y: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= y) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * The runs of rows to draw: every row within a view's height above and below `view`, and each of
 * `keptIndexes` wherever it is, in order and joined where they meet. A view with no height, as
 * before the page lays the list out, draws every row.
 */
export function drawnRanges(
  offsets: number[],
  view: ListView,
  keptIndexes: number[],
): RowRange[] {
  const count = offsets.length - 1;
  if (count <= 0) return [];
  if (view.height <= 0) return [{ start: 0, end: count }];
  const nearView = {
    start: rowAt(offsets, view.top - view.height),
    end: rowAt(offsets, view.top + 2 * view.height) + 1,
  };
  const kept = keptIndexes
    .filter((index) => index >= 0 && index < count)
    .map((index) => ({ start: index, end: index + 1 }));
  const ranges: RowRange[] = [];
  for (const range of [nearView, ...kept].sort((a, b) => a.start - b.start)) {
    const last = ranges[ranges.length - 1];
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end);
    else ranges.push({ ...range });
  }
  return ranges;
}

/**
 * The heights of `after`'s rows, taken from those of `before` for the rows both lists begin and
 * end with alike; the rows between, which a change made, are not known until they are drawn.
 */
export function shiftedHeights<T>(
  heights: (number | undefined)[],
  before: T[],
  after: T[],
  isAlike: (a: T, b: T) => boolean,
): (number | undefined)[] {
  const shorter = Math.min(before.length, after.length);
  let head = 0;
  while (head < shorter && isAlike(before[head], after[head])) head++;
  let tail = 0;
  while (
    tail < shorter - head &&
    isAlike(before[before.length - 1 - tail], after[after.length - 1 - tail])
  )
    tail++;
  return [
    ...heights.slice(0, head),
    ...Array.from({ length: after.length - head - tail }, () => undefined),
    ...heights.slice(before.length - tail, before.length),
  ];
}
