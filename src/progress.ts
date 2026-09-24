import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface PipelineProgress {
  phase: string;
  percent: number | null;
}

export interface PhaseTiming {
  phase: string;
  seconds: number;
}

const PHASE_LABELS: Record<string, string> = {
  prepare: "準備元件",
  convert: "轉檔",
  load: "載入模型",
  transcribe: "轉錄",
  translate: "翻譯",
};

/** Loading a Model compiles its GPU shaders on first use, which can take half a minute. */
const LOAD_NOTE = "（第一次使用會比較久）";

function label(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

/** Calls `show` with a readable line and the percentage, if any, for every `pipeline-progress` event. */
function listenProgress(
  show: (line: string, percent: number | null) => void,
): Promise<UnlistenFn> {
  return listen<PipelineProgress>("pipeline-progress", ({ payload }) => {
    const { phase, percent } = payload;
    const line =
      percent !== null
        ? `${label(phase)} ${percent}%`
        : phase === "load"
          ? `${label(phase)}${LOAD_NOTE}`
          : label(phase);
    show(line, percent);
  });
}

/** Shows `percent` on `bar`, or leaves it without a value - which draws it indeterminate - when there is none. */
function showProgress(bar: HTMLProgressElement, percent: number | null): void {
  bar.hidden = false;
  if (percent === null) bar.removeAttribute("value");
  else bar.value = percent;
}

/** Shows each `pipeline-progress` event on `status` and `bar` while `isRunning` answers true. */
export function followProgress(
  status: HTMLElement,
  bar: HTMLProgressElement | undefined,
  isRunning: () => boolean,
): Promise<UnlistenFn> {
  return listenProgress((line, percent) => {
    if (!isRunning()) return;
    status.textContent = line;
    if (bar) showProgress(bar, percent);
  });
}

/** Each Phase with its seconds, in the order it ran. */
export function describePhases(phases: PhaseTiming[]): string {
  return phases
    .map(({ phase, seconds }) => `${label(phase)} ${seconds.toFixed(1)} 秒`)
    .join(" · ");
}
