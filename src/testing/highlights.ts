/**
 * Stands in for the CSS Custom Highlight API, which happy-dom lacks: each highlight is a set of
 * ranges, as the platform's is, read back in the order they were added.
 */

import { vi } from "vitest";

/** A highlight as the platform keeps one: a set of ranges, read in the order they were added. */
export class StubHighlight extends Set<AbstractRange> {
  constructor(...ranges: AbstractRange[]) {
    super(ranges);
  }

  get ranges(): AbstractRange[] {
    return [...this];
  }
}

/** A range the platform does not keep up to date as the page changes, reading the text it covers. */
export class StubStaticRange {
  readonly startContainer: Node;
  readonly startOffset: number;
  readonly endContainer: Node;
  readonly endOffset: number;

  constructor(init: StaticRangeInit) {
    this.startContainer = init.startContainer;
    this.startOffset = init.startOffset;
    this.endContainer = init.endContainer;
    this.endOffset = init.endOffset;
  }

  toString(): string {
    const range = document.createRange();
    range.setStart(this.startContainer, this.startOffset);
    range.setEnd(this.endContainer, this.endOffset);
    return range.toString();
  }
}

/** Stubs the API for one test, answering the highlights registered under each name. */
export function stubHighlights(): Map<string, StubHighlight> {
  const highlights = new Map<string, StubHighlight>();
  vi.stubGlobal("CSS", { highlights });
  vi.stubGlobal("Highlight", StubHighlight);
  vi.stubGlobal("StaticRange", StubStaticRange);
  return highlights;
}
