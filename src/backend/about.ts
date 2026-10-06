import type * as bindings from "#/backend/bindings.ts";
import { commands } from "#/backend/bindings.ts";

export type AppBuild = bindings.AppBuild;

export function appBuild(): Promise<AppBuild> {
  return commands.appBuild();
}

/** Opens the page listing Tsuzuri's releases, each carrying the source of its ffmpeg, in the system's browser. */
export async function openReleases(): Promise<void> {
  await commands.openReleases();
}

/** Opens the page where Tsuzuri can be sponsored in the system's browser. */
export async function openSponsorship(): Promise<void> {
  await commands.openSponsorship();
}
