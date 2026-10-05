/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import type { ProjectFeed } from "./backend/project";
import type { EditingSession } from "./editor";
import { pageContext } from "./components/context";
import Page from "./Page.svelte";
import { translatePage } from "./i18n";
import { showIcons } from "./ui/icons";

/**
 * Writes the page into `target`, its Svelte Components following `feed` and editing through
 * `session`, then its text in the
 * Interface Language and its icons: both are read from the markup once, so they come after it is
 * written.
 */
export function drawPage(
  feed: ProjectFeed,
  session: EditingSession,
  target: Element = document.body,
): void {
  mount(Page, { target, context: pageContext(feed, session) });
  translatePage(target);
  showIcons(target);
}
