/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`backend/events.ts`).
 */

import type { DownloadProgress } from "../backend/toolchain";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
  }
}

export {};
