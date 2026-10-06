/**
 * The Rust events the page hears, relayed to the window as `rust:<name>` with the payload as
 * `detail`, so a Svelte Component binds one with `<svelte:window>` and Svelte takes it away with
 * the Svelte Component. `projectChanged` is read by `ProjectFeed` instead.
 */

import type { UnlistenFn } from "@tauri-apps/api/event";

import { events } from "#/backend/bindings.ts";

const RELAYED_EVENTS = [
  "pipelineProgress",
  "editCommand",
  "changedElsewhereKept",
  "srtRequested",
  "videoWindowClosing",
  "updateProgress",
  "modelDownloadProgress",
] as const satisfies readonly (keyof typeof events)[];

/** Relays each Rust event the page hears to the window, until the returned function is called. */
export async function relayEvents(): Promise<UnlistenFn> {
  const unlistens = await Promise.all(
    RELAYED_EVENTS.map((key) =>
      events[key].listen(({ event, payload }) =>
        window.dispatchEvent(
          new CustomEvent(`rust:${event}`, { detail: payload }),
        ),
      ),
    ),
  );
  return () => unlistens.forEach((unlisten) => unlisten());
}
