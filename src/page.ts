/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import type { ProjectFeed } from "#/ipc/project.ts";
import type { EditingSession } from "#/editor/index.ts";
import { pageContext } from "#/components/context.ts";
import Page from "#/Page.svelte";

/**
 * Writes the page into `target`, its Svelte Components following `feed` and editing through
 * `session`. Returns the page Svelte Component, for `unmount` to take away.
 */
export function drawPage(
  feed: ProjectFeed,
  session: EditingSession,
  target: Element = document.body,
): Record<string, unknown> {
  return mount(Page, { target, context: pageContext(feed, session) });
}
