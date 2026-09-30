import { invoke } from "@tauri-apps/api/core";
import type * as bindings from "./bindings";

export type Phase = bindings.Phase;

export type PipelineProgress = bindings.PipelineProgress_Serialize;

export type Count = bindings.Count;

export type PhaseTiming = bindings.PhaseTiming;

/** Asks the running transcription or translation to stop; the editor then shows the files again. */
export function cancelTask(): Promise<void> {
  return invoke("cancel_task");
}
