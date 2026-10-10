/**
 * The Project's actions the page, the start screen, the toolbar and the Resource list share; what
 * they make lives in Rust, and each failure is told in a Notification.
 */

import { open as chooseFile, SRT_FILTERS } from "#/ipc/dialog.ts";
import {
  openProject,
  type OpenCommand,
  type ProjectFeed,
  reloadProject,
  setProjectOptions,
  takeRequestedSrt,
} from "#/ipc/project.ts";
import { interfaceLanguageCode, t } from "#/i18n.ts";
import { closeMenu } from "#/ui/menu.ts";
import { attempt, notify } from "#/state/notification.svelte.ts";

/** Opens `path` with the Interface Language for a directory that records none, answering whether it opened. */
function open(command: OpenCommand, path: string): Promise<boolean> {
  return attempt(t("toolbar.notOpened"), () =>
    openProject(command, path, interfaceLanguageCode()),
  );
}

/** Opens the directory the user chooses as the Project, closing the menu `item` was chosen from. */
export async function openDirectory(item: EventTarget | null): Promise<void> {
  closeMenu(item);
  const path = await chooseFile({ multiple: false, directory: true });
  if (path !== null) await open("openProject", path);
}

/** Opens the SRT file the user chooses, closing the menu `item` was chosen from. */
export async function openSrt(item: EventTarget | null): Promise<void> {
  closeMenu(item);
  const path = await chooseFile({
    multiple: false,
    directory: false,
    filters: SRT_FILTERS,
  });
  if (path !== null) await open("openSrt", path);
}

/** Opens the SRT file the system asked to open, as one chosen here. */
export async function openRequestedSrt(): Promise<void> {
  const path = await takeRequestedSrt();
  if (path !== null) await open("openSrt", path);
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

/**
 * Reads the open Project's directory again, for files added or changed elsewhere. The field being
 * typed in is left first, so its text is sent to be written before the directory is read.
 */
export async function reload(feed: ProjectFeed): Promise<void> {
  if (feed.project === null) return;
  if (document.activeElement instanceof HTMLElement)
    document.activeElement.blur();
  await attempt(t("resources.notReloaded"), () => reloadProject());
}

/** Names the open Project `name`, or by its directory when `name` is blank. */
export async function rename(feed: ProjectFeed, name: string): Promise<void> {
  const project = feed.project;
  if (project === null) return;
  await attempt(t("toolbar.notRenamed"), () =>
    setProjectOptions({ ...project.options, name: name || null }),
  );
}

/** Says a subtitle changed elsewhere was read in and where what Tsuzuri held of it was kept. */
export function notifyChangedElsewhereKept(): void {
  notify({
    title: t("versions.changedElsewhereKept"),
    detail: t("versions.changedElsewhereKeptDetail"),
    kind: "warning",
  });
}
