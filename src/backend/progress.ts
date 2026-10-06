import type * as bindings from "#/backend/bindings.ts";
import { commands } from "#/backend/bindings.ts";

export type Phase = bindings.Phase;

export type PipelineProgress = bindings.PipelineProgress_Serialize;

export type Count = bindings.Count;

export type PhaseTiming = bindings.PhaseTiming;

/** Asks the running transcription or translation to stop; the editor then shows the files again. */
export async function cancelTask(): Promise<void> {
  await commands.cancelTask();
}
