import { render } from "@testing-library/svelte";
import type { Component } from "svelte";

import Toolbar from "./Toolbar.svelte";

/** The toolbar props each opening the dialog of one task. */
type TaskOpener = "openTranscription" | "openTranslation" | "openDiarization";

/**
 * Writes `Dialog` beside the toolbar whose `opener` button opens it, as the page composes them,
 * both reading `context`.
 */
export function renderWithToolbar(
  Dialog: Component<Record<string, never>, { open: () => unknown }>,
  opener: TaskOpener,
  context: Map<symbol, unknown>,
): void {
  const { component } = render(Dialog, { context });
  const ignore = () => {};
  render(Toolbar, {
    context,
    props: {
      openSettings: ignore,
      openShortcuts: ignore,
      openTranscription: ignore,
      openTranslation: ignore,
      openDiarization: ignore,
      [opener]: () => component.open(),
    },
  });
}
