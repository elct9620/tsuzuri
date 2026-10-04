/**
 * What `drawPage` hands the Svelte Components through `mount`'s context, and how they read it.
 */

import { getContext } from "svelte";

import type { ProjectFeed } from "../backend/project";
import { TaskRun } from "./task_run.svelte";

const FEED = Symbol("feed");
const TASK_RUN = Symbol("task run");

/**
 * The context the page is mounted with, holding the Project feed and the task run every Svelte
 * Component shares.
 */
export function pageContext(
  feed: ProjectFeed,
  run: TaskRun = new TaskRun(),
): Map<symbol, unknown> {
  return new Map<symbol, unknown>([
    [FEED, feed],
    [TASK_RUN, run],
  ]);
}

/** The Project feed the page was mounted with; called while a Svelte Component initialises. */
export function projectFeed(): ProjectFeed {
  return getContext<ProjectFeed>(FEED);
}

/** The task run the page was mounted with; called while a Svelte Component initialises. */
export function taskRun(): TaskRun {
  return getContext<TaskRun>(TASK_RUN);
}
