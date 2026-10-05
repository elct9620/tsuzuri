/**
 * The Project's actions the start screen, the toolbar and the Resource list share; what they make
 * lives in Rust, and each failure is told in a Notification.
 */

import {
  openProject,
  type OpenCommand,
  type ProjectFeed,
} from "../backend/project";
import { interfaceLanguageCode, t } from "../i18n";
import { closeMenu } from "../ui/menu";
import { notifyFailure } from "../ui/notification.svelte";

/** Runs `action`, saying under `title` why it failed, and answers whether it succeeded. */
async function report(
  title: string,
  action: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    notifyFailure(t(title), error);
    return false;
  }
}

/** Opens `path` with the Interface Language for a directory that records none, answering whether it opened. */
function open(command: OpenCommand, path: string): Promise<boolean> {
  return report("toolbar.notOpened", () =>
    openProject(command, path, interfaceLanguageCode()),
  );
}

/**
 * Opens the Recent Project in `directory`, closing the menu `item` was chosen from. Rust drops one
 * whose directory is gone and announces nothing, so the feed is read again.
 */
export async function openRecent(
  feed: ProjectFeed,
  directory: string,
  item: EventTarget | null,
): Promise<void> {
  closeMenu(item);
  if (!(await open("openProject", directory))) await feed.refresh();
}
