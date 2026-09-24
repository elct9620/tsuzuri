import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface PipelineProgress {
  step: string;
  percent: number;
}

const STEP_LABELS: Record<string, string> = {
  convert: "轉檔",
  transcribe: "轉錄",
  load: "載入翻譯模型",
  translate: "翻譯",
};

/** Calls `show` with a readable line for every `pipeline-progress` event the backend emits. */
export function listenProgress(
  show: (line: string) => void,
): Promise<UnlistenFn> {
  return listen<PipelineProgress>("pipeline-progress", ({ payload }) => {
    show(`${STEP_LABELS[payload.step] ?? payload.step} ${payload.percent}%`);
  });
}
