/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`backend/events.ts`), and the editor's requests
 * to run a task again over the Segments it names.
 */

import type { PipelineProgress } from "../backend/progress";
import type { DownloadProgress } from "../backend/toolchain";
import type { TranscriptionScope } from "../backend/transcription";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
    "onrust:pipeline-progress"?: (event: CustomEvent<PipelineProgress>) => void;
    "onsegment-changes:retranscribe"?: (
      event: CustomEvent<{ scope: TranscriptionScope }>,
    ) => void;
    "onsegment-changes:retranslate"?: (
      event: CustomEvent<{ indexes: number[] }>,
    ) => void;
  }
}

export {};
