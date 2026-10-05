/**
 * The window events Svelte Components bind with `<svelte:window>`: Rust events relayed as
 * `rust:<name>` with the payload as `detail` (`backend/events.ts`), the editor's requests to run
 * a task again over the Segments it names or to name their Speakers, a Speaker menu's request
 * to write the name chosen, the compare menu's request to choose in the Versions dialog, and the
 * transcript telling it has shown the Segments anew.
 */

import type { PipelineProgress } from "../backend/progress";
import type { EditCommand, ProjectView } from "../backend/project";
import type { DownloadProgress } from "../backend/toolchain";
import type { TranscriptionScope } from "../backend/transcription";
import type { UpdateProgress } from "../backend/updates";

declare module "svelte/elements" {
  export interface SvelteWindowAttributes {
    "oncomparison:choose-in-versions"?: (
      event: CustomEvent<{ language: string | null }>,
    ) => void;
    "onrust:changed-elsewhere-kept"?: (event: CustomEvent) => void;
    "onrust:edit-command"?: (event: CustomEvent<EditCommand>) => void;
    "onrust:model-download-progress"?: (
      event: CustomEvent<DownloadProgress>,
    ) => void;
    "onrust:pipeline-progress"?: (event: CustomEvent<PipelineProgress>) => void;
    "onrust:srt-requested"?: (event: CustomEvent) => void;
    "onrust:update-progress"?: (event: CustomEvent<UpdateProgress>) => void;
    "onsegment-changes:retranscribe"?: (
      event: CustomEvent<{ scope: TranscriptionScope }>,
    ) => void;
    "onsegment-changes:retranslate"?: (
      event: CustomEvent<{ indexes: number[] }>,
    ) => void;
    "onsegment-changes:speakers"?: (event: CustomEvent) => void;
    "onspeakers:name"?: (
      event: CustomEvent<{ index: number; name: string }>,
    ) => void;
    "ontranscript:shown"?: (
      event: CustomEvent<{ project: ProjectView | null }>,
    ) => void;
  }
}

export {};
