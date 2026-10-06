/**
 * What `drawPage` hands the Svelte Components through `mount`'s context, what Page adds to it,
 * and how they read it.
 */

import { getContext, setContext } from "svelte";

import type { ProjectFeed } from "#/ipc/project.ts";
import type { TranscriptionScope } from "#/ipc/transcription.ts";
import type { CursorField, EditingSession } from "#/editor/index.ts";
import { AppUpdates } from "#/state/app-updates.svelte.ts";
import { EditingState } from "#/state/editing-state.svelte.ts";
import { EditorComparison } from "#/state/editor-comparison.svelte.ts";
import { SavedPreferences } from "#/state/saved-preferences.svelte.ts";
import { TaskRun } from "#/state/task-run.svelte.ts";

const FEED = Symbol("feed");
const TASK_RUN = Symbol("task run");
const APP_UPDATES = Symbol("app updates");
const SESSION = Symbol("editing session");
const EDITING_STATE = Symbol("editing state");
const SEGMENT_DIALOGS = Symbol("segment dialogs");
const SEGMENT_FIELDS = Symbol("segment fields");
const COMPARISON = Symbol("editor comparison");
const PREFERENCES = Symbol("saved preferences");

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
 * The context the page is mounted with, holding the Project feed, the editing session and what it
 * tells of, the task run, the App Updates, the editor's comparison and the saved Preferences every
 * Svelte Component shares.
 */
export function pageContext(
  feed: ProjectFeed,
  session: EditingSession,
  run: TaskRun = new TaskRun(),
  updates: AppUpdates = new AppUpdates(),
  comparison: EditorComparison = new EditorComparison(),
  saved: SavedPreferences = new SavedPreferences(),
): Map<symbol, unknown> {
  return new Map<symbol, unknown>([
    [FEED, feed],
    [SESSION, session],
    [EDITING_STATE, new EditingState(session)],
    [TASK_RUN, run],
    [APP_UPDATES, updates],
    [COMPARISON, comparison],
    [PREFERENCES, saved],
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

/** What the editing session the page was mounted with tells of; called while a Svelte Component initialises. */
export function editingState(): EditingState {
  return getContext<EditingState>(EDITING_STATE);
}

/** The task run the page was mounted with; called while a Svelte Component initialises. */
export function taskRun(): TaskRun {
  return getContext<TaskRun>(TASK_RUN);
}

/** The App Updates the page was mounted with; called while a Svelte Component initialises. */
export function appUpdates(): AppUpdates {
  return getContext<AppUpdates>(APP_UPDATES);
}

/** The editor's comparison the page was mounted with; called while a Svelte Component initialises. */
export function editorComparison(): EditorComparison {
  return getContext<EditorComparison>(COMPARISON);
}

/** The saved Preferences the page was mounted with; called while a Svelte Component initialises. */
export function savedPreferences(): SavedPreferences {
  return getContext<SavedPreferences>(PREFERENCES);
}

/** Hands the Svelte Components below the dialogs Page holds; called while Page initialises. */
export function setSegmentDialogs(dialogs: SegmentDialogs): void {
  setContext(SEGMENT_DIALOGS, dialogs);
}

/** The dialogs Page holds, which a Segment's menu and the checked bar open. */
export function segmentDialogs(): SegmentDialogs {
  return getContext<SegmentDialogs>(SEGMENT_DIALOGS);
}

/** The fields the Segment rows draw, which the fields themselves and the search bar reach. */
export interface SegmentFields {
  /** The field of `kind` in the row of the Segment at `index`, or none while that row is not drawn. */
  field(index: number, kind: CursorField): HTMLElement | null;
}

/** Hands the Svelte Components below the fields of the Segment rows; called while SegmentRows initialises. */
export function setSegmentFields(fields: SegmentFields): void {
  setContext(SEGMENT_FIELDS, fields);
}

/** The fields the Segment rows draw. */
export function segmentFields(): SegmentFields {
  return getContext<SegmentFields>(SEGMENT_FIELDS);
}

/** `context` with `fields` added, to draw a Svelte Component beside the rows as a test does. */
export function withSegmentFields(
  context: Map<symbol, unknown>,
  fields: SegmentFields,
): Map<symbol, unknown> {
  return new Map([...context, [SEGMENT_FIELDS, fields]]);
}

/** `context` with `dialogs` added, to draw the Segment list apart from Page as a test does. */
export function withSegmentDialogs(
  context: Map<symbol, unknown>,
  dialogs: SegmentDialogs,
): Map<symbol, unknown> {
  return new Map([...context, [SEGMENT_DIALOGS, dialogs]]);
}
