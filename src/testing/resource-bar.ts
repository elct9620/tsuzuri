import type { Component } from "svelte";

import type { ProjectFeed, ProjectView } from "#/ipc/project.ts";
import ResourceBar from "#/components/ResourceBar.svelte";
import { renderFollowingProject } from "#/testing/following-project.ts";

/** The resource bar props each opening the dialog of one task. */
type TaskOpener = "openTranscription" | "openTranslation" | "openDiarization";

/**
 * Writes `Dialog` beside the resource bar whose `opener` opens it, as the page composes them,
 * both reading `context` and handed each Project `feed` reads.
 */
export function renderWithResourceBar<Exports extends { open: () => unknown }>(
  Dialog: Component<{ project: ProjectView | null }, Exports>,
  opener: TaskOpener,
  context: Map<symbol, unknown>,
  feed: ProjectFeed,
): Exports {
  const component = renderFollowingProject(Dialog, feed, { context });
  const ignore = () => {};
  renderFollowingProject(ResourceBar, feed, {
    context,
    props: {
      openTranscription: ignore,
      openTranslation: ignore,
      openDiarization: ignore,
      [opener]: () => component.open(),
    },
  });
  return component;
}
