/**
 * Writes what the Project's own settings change, saying in a Notification why Rust refused it.
 */

import {
  setPrimaryLanguage,
  setProjectOptions,
  type ProjectOptions,
  type ProjectView,
} from "#/ipc/project.ts";
import { t } from "#/i18n.ts";
import { notifyFailure } from "#/ui/notification.svelte.ts";

/** Sets the Project Options as `project` holds them, with `changes` in their place. */
export async function saveOptions(
  project: ProjectView,
  changes: Partial<ProjectOptions>,
): Promise<void> {
  await report(() => setProjectOptions({ ...project.options, ...changes }));
}

export async function setLanguage(language: string): Promise<void> {
  await report(() => setPrimaryLanguage(language));
}

/** Runs `action`, showing why it failed. */
async function report(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    notifyFailure(t("settings.notSaved"), error);
  }
}
