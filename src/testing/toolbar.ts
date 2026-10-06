import type { Component } from "svelte";

import type { ProjectFeed, ProjectView } from "#/ipc/project.ts";
import { ResourceDock } from "#/state/resource-dock.svelte.ts";
import Toolbar from "#/components/Toolbar.svelte";
import { renderFollowingProject } from "#/testing/following-project.ts";

/** The toolbar props each opening the dialog of one task. */
type TaskOpener = "openTranscription" | "openTranslation" | "openDiarization";

/**
 * Writes `Dialog` beside the toolbar whose `opener` button opens it, as the page composes them,
 * both reading `context` and handed each Project `feed` reads.
 */
export function renderWithToolbar<Exports extends { open: () => unknown }>(
  Dialog: Component<{ project: ProjectView | null }, Exports>,
  opener: TaskOpener,
  context: Map<symbol, unknown>,
  feed: ProjectFeed,
): Exports {
  const component = renderFollowingProject(Dialog, feed, { context });
  const ignore = () => {};
  renderFollowingProject(Toolbar, feed, {
    context,
    props: {
      dock: new ResourceDock(),
      recentProjects: [],
      openSettings: ignore,
      openShortcuts: ignore,
      openTranscription: ignore,
      openTranslation: ignore,
      openDiarization: ignore,
      [opener]: () => component.open(),
    },
  });
  return component;
}
