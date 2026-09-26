/**
 * The Rust events a controller hears, relayed to the window as `rust:<name>` with the payload as
 * `detail`, so each controller binds one with a Stimulus action and Stimulus takes it away with
 * the element. `project-changed` is read by `ProjectFeed` instead.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const RELAYED_EVENTS = [
  "pipeline-progress",
  "edit-command",
  "changed-elsewhere-kept",
  "video-window-closing",
] as const;

/** Relays each Rust event a controller hears to the window, until the returned function is called. */
export async function relayEvents(): Promise<UnlistenFn> {
  const unlistens = await Promise.all(
    RELAYED_EVENTS.map((name) =>
      listen(name, ({ payload }) =>
        window.dispatchEvent(
          new CustomEvent(`rust:${name}`, { detail: payload }),
        ),
      ),
    ),
  );
  return () => unlistens.forEach((unlisten) => unlisten());
}
