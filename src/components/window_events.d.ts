/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`backend/events.ts`), and the editor's requests
 * to run a task again over the Segments it names.
 */

import type { PipelineProgress } from "../backend/progress";
import type { EditCommand } from "../backend/project";
import type { DownloadProgress } from "../backend/toolchain";
import type { TranscriptionScope } from "../backend/transcription";
import type { UpdateProgress } from "../backend/updates";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "onrust:edit-command"?: (event: CustomEvent<EditCommand>) => void;
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
    "onrust:pipeline-progress"?: (event: CustomEvent<PipelineProgress>) => void;
    "onrust:update-progress"?: (event: CustomEvent<UpdateProgress>) => void;
    "onsegment-changes:retranscribe"?: (
      event: CustomEvent<{ scope: TranscriptionScope }>,
    ) => void;
    "onsegment-changes:retranslate"?: (
      event: CustomEvent<{ indexes: number[] }>,
    ) => void;
  }
}

export {};
