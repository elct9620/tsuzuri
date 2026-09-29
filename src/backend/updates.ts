import { invoke } from "@tauri-apps/api/core";

/** A release of Tsuzuri newer than the running one, with its Release Name. */
export interface AppUpdate {
  release_number: string;
  release_name: string;
  is_preview_build: boolean;
}

/** Where Tsuzuri looks for an App Update. */
export type UpdateChannel = "stable" | "preview";

/** Whether Tsuzuri looks for an App Update at launch, and in which Update Channel. */
export interface UpdateSettings {
  has_launch_check: boolean;
  channel: UpdateChannel;
}

/** How much of the App Update being installed has downloaded, in bytes; the total when the release names it. */
export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** Looks for an App Update, failing when the releases cannot be read. */
export function checkForUpdate(): Promise<AppUpdate | null> {
  return invoke<AppUpdate | null>("check_for_update");
}

/** Looks for an App Update unless the settings turn that off, answering none when the releases cannot be read. */
export function checkForUpdateAtLaunch(): Promise<AppUpdate | null> {
  return invoke<AppUpdate | null>("check_for_update_at_launch");
}

/** Looks for the latest stable release even when it is older than the running one, for a Preview build to go back to. */
export function checkForRollback(): Promise<AppUpdate | null> {
  return invoke<AppUpdate | null>("check_for_rollback");
}

export function chooseUpdateChannel(
  channel: UpdateChannel,
): Promise<UpdateSettings> {
  return invoke<UpdateSettings>("choose_update_channel", { channel });
}

/** Downloads and installs the App Update the last check found, then restarts Tsuzuri. */
export function installUpdate(): Promise<void> {
  return invoke("install_update");
}

export function updateSettings(): Promise<UpdateSettings> {
  return invoke<UpdateSettings>("update_settings");
}

export function chooseLaunchCheck(
  hasLaunchCheck: boolean,
): Promise<UpdateSettings> {
  return invoke<UpdateSettings>("choose_launch_check", { hasLaunchCheck });
}
