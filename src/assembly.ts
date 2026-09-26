/**
 * The webview's Composition Root: one Project feed and one editing session, handed to each controller
 * as it is registered. The session reads each Project before any controller does and tells of the
 * Cursor only after all of them have drawn it, as the page's `editor:cursor`, `editor:choice` and
 * `editor:checks`; the other Rust events reach the page as `rust:<name>`.
 */

import type { Application, ControllerConstructor } from "@hotwired/stimulus";

import { editingPort, transcriptView } from "./backend/editing";
import { relayEvents } from "./backend/events";
import { ProjectFeed, type UnlistenFn } from "./backend/project";
import { EditingSession } from "./editor";

/** What a controller is handed as it is registered. */
export interface Dependencies {
  feed: ProjectFeed;
  session: EditingSession;
}

export interface Assembly extends Dependencies {
  /**
   * Reads the Project now and on each change, and relays the other Rust events to the window,
   * until the returned function is called.
   */
  start(): Promise<UnlistenFn>;
}

export function assemble(
  application: Application,
  controllers: Record<string, ControllerConstructor>,
): Assembly {
  const feed = new ProjectFeed();
  const session = new EditingSession(editingPort);
  feed.follow((project) => session.follow(transcriptView(project)));
  feed.afterEach(() => session.announce());
  session.onChange((change) =>
    window.dispatchEvent(new CustomEvent(`editor:${change}`)),
  );
  for (const [name, controller] of Object.entries(controllers))
    application.register(
      name,
      class extends controller {
        readonly feed = feed;
        readonly session = session;
      },
    );
  const start = async () => {
    const unrelay = await relayEvents();
    const unfollow = await feed.start();
    return () => {
      unfollow();
      unrelay();
    };
  };
  return { feed, session, start };
}
