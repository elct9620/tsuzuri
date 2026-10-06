import type * as bindings from "#/ipc/bindings.ts";
import { commands } from "#/ipc/bindings.ts";

export type AppUpdate = bindings.AppUpdate;

export type UpdateChannel = bindings.UpdateChannel;

export type UpdateSettings = bindings.UpdateSettings;

export type UpdateProgress = bindings.UpdateProgress;

/** Looks for an App Update, failing when the releases cannot be read. */
export function checkForUpdate(): Promise<AppUpdate | null> {
  return commands.checkForUpdate();
}

/** Looks for an App Update unless the settings turn that off, answering none when the releases cannot be read. */
export function checkForUpdateAtLaunch(): Promise<AppUpdate | null> {
  return commands.checkForUpdateAtLaunch();
}

/** Looks for the latest stable release even when it is older than the running one, for a Preview build to go back to. */
export function checkForRollback(): Promise<AppUpdate | null> {
  return commands.checkForRollback();
}

export function chooseUpdateChannel(
  channel: UpdateChannel,
): Promise<UpdateSettings> {
  return commands.chooseUpdateChannel(channel);
}

/** Downloads and installs the App Update the last check found, then restarts Tsuzuri. */
export async function installUpdate(): Promise<void> {
  await commands.installUpdate();
}

export function updateSettings(): Promise<UpdateSettings> {
  return commands.updateSettings();
}

export function chooseLaunchCheck(
  hasLaunchCheck: boolean,
): Promise<UpdateSettings> {
  return commands.chooseLaunchCheck(hasLaunchCheck);
}
