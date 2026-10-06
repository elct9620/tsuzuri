/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`ipc/events.ts`), the session telling the Cursor,
 * the checks or the Choice Source moved, and the system turning to a light or dark theme.
 */

import type { PipelineProgress } from "#/ipc/progress.ts";
import type { EditCommand } from "#/ipc/project.ts";
import type { DownloadProgress } from "#/ipc/toolchain.ts";
import type { UpdateProgress } from "#/ipc/updates.ts";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "oneditor:checks"?: (event: CustomEvent) => void;
    "oneditor:choice"?: (event: CustomEvent) => void;
    "oneditor:cursor"?: (event: CustomEvent) => void;
    "onrust:changed-elsewhere-kept"?: (event: CustomEvent) => void;
    "onrust:edit-command"?: (event: CustomEvent<EditCommand>) => void;
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
    "onrust:pipeline-progress"?: (event: CustomEvent<PipelineProgress>) => void;
    "onrust:srt-requested"?: (event: CustomEvent) => void;
    "onrust:update-progress"?: (event: CustomEvent<UpdateProgress>) => void;
    "onrust:video-window-closing"?: (event: CustomEvent) => void;
    "onsystem:color-scheme"?: (event: CustomEvent) => void;
  }
}

export {};
