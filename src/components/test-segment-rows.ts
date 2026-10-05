/**
 * Draws the Segment rows into a test's own markup, as the page draws them inside its Segment list,
 * so a controller test hosting other regions works with the real rows.
 */

import { render } from "@testing-library/svelte";

import { PlaybackFollowing } from "./playback-following.svelte";
import SegmentRows from "./SegmentRows.svelte";

/** The rows drawn, the following playback they share with the Preview's button, and how to take them away. */
export interface DrawnSegmentRows {
  rows: SegmentRows;
  following: PlaybackFollowing;
  unmount: () => void;
}

/** Draws the rows at the end of `target`, reading the feed, session and task run of `context`. */
export function drawSegmentRows(
  target: HTMLElement,
  context: Map<symbol, unknown>,
): DrawnSegmentRows {
  const following = new PlaybackFollowing();
  const { component, unmount } = render(SegmentRows, {
    target,
    props: { following },
    context,
  });
  return { rows: component, following, unmount };
}

/** The list the rows are drawn in. */
export function rowList(): HTMLOListElement {
  return document.querySelector<HTMLOListElement>('ol[aria-label="段落"]')!;
}

/** The rows standing for Segments, Placeholders and removed cues left out. */
export function segmentRows(): HTMLLIElement[] {
  return [
    ...rowList().querySelectorAll<HTMLLIElement>(
      ":scope > li:not([data-placeholder]):not([data-ghost])",
    ),
  ];
}
