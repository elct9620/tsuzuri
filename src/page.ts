/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import type { ProjectFeed } from "./backend/project";
import type { EditingSession } from "./editor";
import { pageContext } from "./components/context";
import Page from "./Page.svelte";
import { translatePage } from "./i18n";

/**
 * Writes the page into `target`, its Svelte Components following `feed` and editing through
 * `session`, then its text in the Interface Language, which is read from the markup once, so it
 * comes after the markup is written. Returns the page Svelte Component, for `unmount` to take away.
 */
export function drawPage(
  feed: ProjectFeed,
  session: EditingSession,
  target: Element = document.body,
): Record<string, unknown> {
  const page = mount(Page, { target, context: pageContext(feed, session) });
  translatePage(target);
  return page;
}
