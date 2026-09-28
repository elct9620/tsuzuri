import { invoke } from "@tauri-apps/api/core";

/** A release of Tsuzuri newer than the running one. */
export interface AppUpdate {
  release_number: string;
}

/** Whether Tsuzuri looks for an App Update at launch. */
export interface UpdateSettings {
  has_launch_check: boolean;
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
