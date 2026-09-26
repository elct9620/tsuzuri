import { invoke } from "@tauri-apps/api/core";
/** Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage. */
export interface PipelineProgress {
  phase: string;
  percent: number | null;
  /** How many of the things the Phase works through it has finished, when it counts them. */
  count?: Count;
}

/** How many of the things a Phase works through it has finished. */
export interface Count {
  done: number;
  total: number;
}

/** How long one Phase of a task took. */
export interface PhaseTiming {
  phase: string;
  seconds: number;
}

/** Asks the running transcription or translation to stop; the editor then shows the files again. */
export function cancelTask(): Promise<void> {
  return invoke("cancel_task");
}
