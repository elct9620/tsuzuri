import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface PipelineProgress {
  phase: string;
  percent: number | null;
}

const PHASE_LABELS: Record<string, string> = {
  prepare: "準備元件",
  convert: "轉檔",
  load: "載入模型",
  transcribe: "轉錄",
  translate: "翻譯",
};

/** Calls `show` with a readable line for every `pipeline-progress` event the backend emits. */
export function listenProgress(
  show: (line: string) => void,
): Promise<UnlistenFn> {
  return listen<PipelineProgress>("pipeline-progress", ({ payload }) => {
    const label = PHASE_LABELS[payload.phase] ?? payload.phase;
    show(payload.percent === null ? label : `${label} ${payload.percent}%`);
  });
}
