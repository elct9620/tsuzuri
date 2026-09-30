import { invoke } from "@tauri-apps/api/core";
import type * as bindings from "./bindings";

export type AppBuild = bindings.AppBuild;

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
