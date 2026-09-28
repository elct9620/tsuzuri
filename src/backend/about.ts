import { invoke } from "@tauri-apps/api/core";

/** What a Preview build is based on and when it was built, as `YYYYMMDDTHHMMSSZ` in UTC. */
export interface PreviewRelease {
  based_on: string;
  built_at: string;
}

/** The release number of the running Tsuzuri, what a Preview build is based on, whether its install offers the Preview channel, and the commit it was built from. */
export interface AppBuild {
  release_number: string;
  preview: PreviewRelease | null;
  has_preview_channel: boolean;
  commit: string;
}

export function appBuild(): Promise<AppBuild> {
  return invoke<AppBuild>("app_build");
}

/** Opens the page listing Tsuzuri's releases, each carrying the source of its ffmpeg, in the system's browser. */
export function openReleases(): Promise<void> {
  return invoke("open_releases");
}

/** Opens the page where Tsuzuri can be sponsored in the system's browser. */
export function openSponsorship(): Promise<void> {
  return invoke("open_sponsorship");
}
