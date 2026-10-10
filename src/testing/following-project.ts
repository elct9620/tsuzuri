import { render } from "@testing-library/svelte";
import type { Component } from "svelte";

import type { ProjectFeed, ProjectView } from "#/ipc/project.ts";

/** What `render` takes beside the Svelte Component, its `project` left to the feed. */
interface FollowingOptions<Props> {
  props?: Omit<Props, "project">;
  context?: Map<symbol, unknown>;
  target?: HTMLElement;
}

/**
 * Draws `Drawn` with its `project` prop following `feed`, as Page hands each Project it reads to
 * the Svelte Components below it, and returns the Svelte Component drawn.
 */
export function renderFollowingProject<
  Props extends { project: ProjectView | null },
  Exports extends Record<string, unknown>,
>(
  Drawn: Component<Props, Exports>,
  feed: ProjectFeed,
  { props, ...options }: FollowingOptions<Props> = {},
): Exports {
  const { component, rerender } = render(Drawn, {
    ...options,
    props: { ...props, project: null },
  } as Parameters<typeof render<typeof Drawn>>[1]);
  feed.follow((project) => void rerender({ project } as Partial<Props>));
  return component;
}
