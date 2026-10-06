/**
 * The webview's Composition Root: one Project feed and one editing session, which the page's
 * Svelte Components are handed through its context. The session reads each Project before any of
 * them does and tells of the Cursor only after all of them have drawn it, as the page's
 * `editor:cursor`, `editor:choice` and `editor:checks`; the other Rust events reach the page as
 * `rust:<name>`, and the system turning to a light or dark theme as `system:color-scheme`.
 */

import { editingPort, transcriptView } from "#/ipc/editing.ts";
import { relayEvents } from "#/ipc/events.ts";
import { ProjectFeed, type UnlistenFn } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";

export interface Assembly {
  feed: ProjectFeed;
  session: EditingSession;
  /**
   * Reads the Project now and on each change, and relays the other Rust events to the window,
   * until the returned function is called.
   */
  start(): Promise<UnlistenFn>;
}

/** Tells the page, as `system:<name>`, each time the system's answer to the media `query` turns. */
function relaySystemChange(query: string, name: string): UnlistenFn {
  const answer = matchMedia(query);
  const tell = () => window.dispatchEvent(new CustomEvent(`system:${name}`));
  answer.addEventListener("change", tell);
  return () => answer.removeEventListener("change", tell);
}

export function assemble(): Assembly {
  const feed = new ProjectFeed();
  const session = new EditingSession(editingPort);
  feed.follow((project) => session.follow(transcriptView(project)));
  feed.afterEach(() => session.announce());
  session.onChange((change) =>
    window.dispatchEvent(new CustomEvent(`editor:${change}`)),
  );
  const start = async () => {
    const unrelay = await relayEvents();
    // The system may ask to open an SRT file before the relay listens, as a launch to open one does.
    window.dispatchEvent(new CustomEvent("rust:srt-requested"));
    const unrelayScheme = relaySystemChange(
      "(prefers-color-scheme: dark)",
      "color-scheme",
    );
    const unfollow = await feed.start();
    return () => {
      unfollow();
      unrelayScheme();
      unrelay();
    };
  };
  return { feed, session, start };
}
