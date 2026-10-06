/**
 * Draws the Segment rows, or the whole Segment list, into a test's own markup as the page draws
 * them, so a test of another region works with the real rows and checked bar.
 */

import { render, screen, within } from "@testing-library/svelte";

import type { ProjectFeed } from "#/ipc/project.ts";
import { type SegmentDialogs, withSegmentDialogs } from "#/state/context.ts";
import { Playback } from "#/state/playback.svelte.ts";
import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
import { ViewChoices } from "#/state/view-choices.svelte.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import type ShiftDialog from "#/components/ShiftDialog.svelte";
import type SpeakersDialog from "#/components/SpeakersDialog.svelte";
import SegmentList from "#/components/SegmentList.svelte";
import SegmentRows from "#/components/SegmentRows.svelte";
import type { Layout } from "#/state/layout-choice.svelte.ts";
import type TranscriptionDialog from "#/components/TranscriptionDialog.svelte";
import type TranslationDialog from "#/components/TranslationDialog.svelte";

/** The rows drawn, what they mark as played and follow, and how to take them away. */
export interface DrawnSegmentRows {
  rows: SegmentRows;
  playback: Playback;
  viewChoices: ViewChoices;
  placeholders: ResourcePlaceholders;
  unmount: () => void;
}

/**
 * Draws the rows at the end of `target`, reading the feed, session and task run of `context`,
 * marking what `playback` plays and showing their columns as `viewChoices` and `editorLayout` ask.
 */
export function drawSegmentRows(
  target: HTMLElement,
  context: Map<symbol, unknown>,
  playback = new Playback(),
  viewChoices = new ViewChoices(),
  editorLayout: Layout = "v1",
): DrawnSegmentRows {
  const placeholders = new ResourcePlaceholders();
  const { component, unmount } = render(SegmentRows, {
    target,
    props: { playback, placeholders, viewChoices, editorLayout },
    context,
  });
  return { rows: component, playback, viewChoices, placeholders, unmount };
}

/** The list the rows are drawn in. */
export function rowList(): HTMLOListElement {
  return document.querySelector<HTMLOListElement>('ol[aria-label="段落"]')!;
}

/** The rows standing for Segments, Placeholders and removed cues left out. */
export function segmentRows(): HTMLLIElement[] {
  return [
    ...rowList().querySelectorAll<HTMLLIElement>(
      ":scope > li:not([data-placeholder]):not([data-ghost])",
    ),
  ];
}

/** The dialogs a test drew, opened as Page opens them; one it did not draw cannot be opened. */
export function segmentDialogsOf(drawn: {
  translation?: TranslationDialog;
  transcription?: TranscriptionDialog;
  shift?: ShiftDialog;
  speakers?: SpeakersDialog;
}): SegmentDialogs {
  return {
    openRetranslation: (indexes) => drawn.translation!.openForSegments(indexes),
    openRetranscription: (scope) =>
      void drawn.transcription!.openForScope(scope),
    openShift: () => drawn.shift!.open(),
    openSpeakers: (indexes) => drawn.speakers!.openFor(indexes),
  };
}

/**
 * Draws the Segment list at the end of `target`, following each Project `feed` reads, its menus
 * and checked bar opening `dialogs`.
 */
export function drawSegmentList(
  target: HTMLElement,
  feed: ProjectFeed,
  context: Map<symbol, unknown>,
  dialogs: SegmentDialogs,
): SegmentList {
  return renderFollowingProject(SegmentList, feed, {
    target,
    props: {
      playback: new Playback(),
      placeholders: new ResourcePlaceholders(),
      viewChoices: new ViewChoices(),
    },
    context: withSegmentDialogs(context, dialogs),
  });
}

/** The checked bar's button named `name`, or none while no Segment is checked or it offers none such. */
export function checkedBarButton(name: string): HTMLButtonElement | null {
  // A dialog naming the Checked Segments says the same count
  const count = screen
    .queryAllByText(/^已勾選 \d+ 段$/)
    .find((element) => !element.closest("dialog"));
  if (!count?.parentElement) return null;
  return within(count.parentElement).queryByRole("button", { name });
}
