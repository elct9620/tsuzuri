import { invoke } from "@tauri-apps/api/core";

/** The release number of the running Tsuzuri and the commit it was built from. */
export interface AppBuild {
  release_number: string;
  commit: string;
}

export function appBuild(): Promise<AppBuild> {
  return invoke<AppBuild>("app_build");
}

/** Opens the page listing Tsuzuri's releases, each carrying the source of its ffmpeg, in the system's browser. */
export function openReleases(): Promise<void> {
  return invoke("open_releases");
}
