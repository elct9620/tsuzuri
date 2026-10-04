/**
 * What `drawPage` hands the Svelte Components through `mount`'s context.
 */

import type { ProjectFeed } from "../backend/project";

const FEED = Symbol("feed");

/** The context the page is mounted with, holding the Project feed every Svelte Component shares. */
export function pageContext(feed: ProjectFeed): Map<symbol, unknown> {
  return new Map([[FEED, feed]]);
}
