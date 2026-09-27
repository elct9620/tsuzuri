import { invoke } from "@tauri-apps/api/core";

/** Opens the page listing Tsuzuri's releases, each carrying the source of its ffmpeg, in the system's browser. */
export function openReleases(): Promise<void> {
  return invoke("open_releases");
}
