import { render } from "@testing-library/svelte";
import type { Component } from "svelte";

import { ResourceDock } from "./resource-dock.svelte";
import Toolbar from "./Toolbar.svelte";

/** The toolbar props each opening the dialog of one task. */
type TaskOpener = "openTranscription" | "openTranslation" | "openDiarization";

/**
 * Writes `Dialog` beside the toolbar whose `opener` button opens it, as the page composes them,
 * both reading `context`.
 */
export function renderWithToolbar<Exports extends { open: () => unknown }>(
  Dialog: Component<Record<string, never>, Exports>,
  opener: TaskOpener,
  context: Map<symbol, unknown>,
): Exports {
  const { component } = render(Dialog, { context });
  const ignore = () => {};
  render(Toolbar, {
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
