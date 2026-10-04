/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import type { ProjectFeed } from "./backend/project";
import { pageContext } from "./components/context";
import Page from "./Page.svelte";
import { translatePage } from "./i18n";
import { showIcons } from "./ui/icons";

/**
 * Writes the page into `target`, its Svelte Components following `feed`, then its text in the
 * Interface Language and its icons: both are read from the markup once, so they come after it is
 * written.
 */
export function drawPage(
  feed: ProjectFeed,
  target: Element = document.body,
): void {
  mount(Page, { target, context: pageContext(feed) });
  translatePage(target);
  showIcons(target);
}
