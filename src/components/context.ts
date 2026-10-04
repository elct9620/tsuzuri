/**
 * What `drawPage` hands the Svelte Components through `mount`'s context, and how they read it.
 */

import { getContext } from "svelte";

import type { ProjectFeed } from "../backend/project";

const FEED = Symbol("feed");

/** The context the page is mounted with, holding the Project feed every Svelte Component shares. */
export function pageContext(feed: ProjectFeed): Map<symbol, unknown> {
  return new Map([[FEED, feed]]);
}

/** The Project feed the page was mounted with; called while a Svelte Component initialises. */
export function projectFeed(): ProjectFeed {
  return getContext<ProjectFeed>(FEED);
}
