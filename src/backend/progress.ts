import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type { UnlistenFn };

/** Sent as each Phase starts and as its percentage changes; a Phase that cannot tell how far along it is has no percentage. */
export interface PipelineProgress {
  phase: string;
  percent: number | null;
}

/** How long one Phase of a task took. */
export interface PhaseTiming {
  phase: string;
  seconds: number;
}

/** Calls `show` with every `pipeline-progress` event. */
export function listenProgress(
  show: (progress: PipelineProgress) => void,
): Promise<UnlistenFn> {
  return listen<PipelineProgress>("pipeline-progress", ({ payload }) =>
    show(payload),
  );
}
