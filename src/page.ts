/**
 * The page's markup, written by Svelte inside the `<body>` that `index.html` gives it.
 */

import { mount } from "svelte";

import type { ProjectFeed } from "./backend/project";
import { pageContext } from "./components/context";
import { TaskRun } from "./components/task_run.svelte";
import Page from "./Page.svelte";
import { translatePage } from "./i18n";
import { showIcons } from "./ui/icons";

/**
 * Writes the page into `target`, its Svelte Components following `feed` and `run`, then its text
 * in the Interface Language and its icons: both are read from the markup once, so they come after
 * it is written.
 */
export function drawPage(
  feed: ProjectFeed,
  target: Element = document.body,
  run: TaskRun = new TaskRun(),
): void {
  mount(Page, { target, context: pageContext(feed, run) });
  translatePage(target);
  showIcons(target);
}
