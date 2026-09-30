/**
 * The Rust events a controller hears, relayed to the window as `rust:<name>` with the payload as
 * `detail`, so each controller binds one with a Stimulus action and Stimulus takes it away with
 * the element. `projectChanged` is read by `ProjectFeed` instead.
 */

import type { UnlistenFn } from "@tauri-apps/api/event";

import { events } from "./bindings";

const RELAYED_EVENTS = [
  "pipelineProgress",
  "editCommand",
  "changedElsewhereKept",
  "srtRequested",
  "videoWindowClosing",
  "updateProgress",
  "modelDownloadProgress",
] as const satisfies readonly (keyof typeof events)[];

/** Relays each Rust event a controller hears to the window, until the returned function is called. */
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
