/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`backend/events.ts`), the session telling the Cursor
 * or the checks moved, and the Preview telling which Segments it plays.
 */

import type { PipelineProgress } from "../backend/progress";
import type { EditCommand } from "../backend/project";
import type { DownloadProgress } from "../backend/toolchain";
import type { UpdateProgress } from "../backend/updates";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "oneditor:checks"?: (event: CustomEvent) => void;
    "oneditor:cursor"?: (event: CustomEvent) => void;
    "onpreview:playing"?: (event: CustomEvent<{ indexes: number[] }>) => void;
    "onrust:changed-elsewhere-kept"?: (event: CustomEvent) => void;
    "onrust:edit-command"?: (event: CustomEvent<EditCommand>) => void;
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
    "onrust:pipeline-progress"?: (event: CustomEvent<PipelineProgress>) => void;
    "onrust:srt-requested"?: (event: CustomEvent) => void;
    "onrust:update-progress"?: (event: CustomEvent<UpdateProgress>) => void;
  }
}

export {};
