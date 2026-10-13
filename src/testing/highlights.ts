/**
 * Stands in for the CSS Custom Highlight API, which happy-dom lacks: each highlight is a set of
 * ranges, as the platform's is, read back in the order they were added.
 */

import { vi } from "vitest";

/** A highlight as the platform keeps one: a set of ranges, read in the order they were added. */
export class StubHighlight extends Set<Range> {
  constructor(...ranges: Range[]) {
    super(ranges);
  }

  get ranges(): Range[] {
    return [...this];
  }
}

/** Stubs the API for one test, answering the highlights registered under each name. */
export function stubHighlights(): Map<string, StubHighlight> {
  const highlights = new Map<string, StubHighlight>();
  vi.stubGlobal("CSS", { highlights });
  vi.stubGlobal("Highlight", StubHighlight);
  return highlights;
}
