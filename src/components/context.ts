/**
 * What `drawPage` hands the Svelte Components through `mount`'s context, what Page adds to it,
 * and how they read it.
 */

import { getContext, setContext } from "svelte";

import type { ProjectFeed } from "../backend/project";
import type { TranscriptionScope } from "../backend/transcription";
import type { EditingSession } from "../editor";
import { AppUpdates } from "./app-updates.svelte";
import { TaskRun } from "./task-run.svelte";

const FEED = Symbol("feed");
const TASK_RUN = Symbol("task run");
const APP_UPDATES = Symbol("app updates");
const SESSION = Symbol("editing session");
const SEGMENT_DIALOGS = Symbol("segment dialogs");

/** The dialogs beside the page's main element that a Segment's menu and the checked bar open. */
export interface SegmentDialogs {
  /** Translates the Segments at `indexes` again. */
  openRetranslation(indexes: number[]): void;
  /** Transcribes again within `scope`. */
  openRetranscription(scope: TranscriptionScope): void;
  /** Shifts the Checked Segments. */
  openShift(): void;
  /** Names the Speaker of the Checked Segments `indexes`. */
  openSpeakers(indexes: number[]): void;
}

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

/** Hands the Svelte Components below the dialogs Page holds; called while Page initialises. */
export function setSegmentDialogs(dialogs: SegmentDialogs): void {
  setContext(SEGMENT_DIALOGS, dialogs);
}

/** The dialogs Page holds, which a Segment's menu and the checked bar open. */
export function segmentDialogs(): SegmentDialogs {
  return getContext<SegmentDialogs>(SEGMENT_DIALOGS);
}

/** `context` with `dialogs` added, to draw the Segment list apart from Page as a test does. */
export function withSegmentDialogs(
  context: Map<symbol, unknown>,
  dialogs: SegmentDialogs,
): Map<symbol, unknown> {
  return new Map([...context, [SEGMENT_DIALOGS, dialogs]]);
}
