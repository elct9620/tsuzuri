/**
 * Writes what the Project's own settings change, saying in a system dialog why Rust refused it.
 */

import { message } from "../../../backend/dialog";
import {
  setPrimaryLanguage,
  setProjectOptions,
  type ProjectOptions,
  type ProjectView,
} from "../../../backend/project";
import { failureKind, failureMessage } from "../../../ui/failure";

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
    const kind = failureKind(error) === "warning" ? "warning" : "error";
    await message(failureMessage(error), { kind });
  }
}
