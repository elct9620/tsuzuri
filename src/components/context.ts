/**
 * What `drawPage` hands the Svelte Components through `mount`'s context, and how they read it.
 */

import { getContext } from "svelte";

import type { ProjectFeed } from "../backend/project";
import type { EditingSession } from "../editor";
import { AppUpdates } from "./app-updates.svelte";
import { TaskRun } from "./task-run.svelte";

const FEED = Symbol("feed");
const TASK_RUN = Symbol("task run");
const APP_UPDATES = Symbol("app updates");
const SESSION = Symbol("editing session");

/**
 * The context the page is mounted with, holding the Project feed, the editing session, the task
 * run and the App Updates every Svelte Component shares.
 */
export function pageContext(
  feed: ProjectFeed,
  session: EditingSession,
  run: TaskRun = new TaskRun(),
  updates: AppUpdates = new AppUpdates(),
): Map<symbol, unknown> {
  return new Map<symbol, unknown>([
    [FEED, feed],
    [SESSION, session],
    [TASK_RUN, run],
    [APP_UPDATES, updates],
  ]);
}

/** The Project feed the page was mounted with; called while a Svelte Component initialises. */
export function projectFeed(): ProjectFeed {
  return getContext<ProjectFeed>(FEED);
}

/** The editing session the page was mounted with; called while a Svelte Component initialises. */
export function editingSession(): EditingSession {
  return getContext<EditingSession>(SESSION);
}

/** The task run the page was mounted with; called while a Svelte Component initialises. */
export function taskRun(): TaskRun {
  return getContext<TaskRun>(TASK_RUN);
}

/** The App Updates the page was mounted with; called while a Svelte Component initialises. */
export function appUpdates(): AppUpdates {
  return getContext<AppUpdates>(APP_UPDATES);
}
