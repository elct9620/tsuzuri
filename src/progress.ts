import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { t } from "./i18n";

interface PipelineProgress {
  phase: string;
  percent: number | null;
}

export interface PhaseTiming {
  phase: string;
  seconds: number;
}

function label(phase: string): string {
  return t(`phases.${phase}`, { defaultValue: phase });
}

/** Calls `show` with a readable line and the percentage, if any, for every `pipeline-progress` event. */
function listenProgress(
  show: (line: string, percent: number | null) => void,
): Promise<UnlistenFn> {
  return listen<PipelineProgress>("pipeline-progress", ({ payload }) => {
    const { phase, percent } = payload;
    // Loading a Model compiles its GPU shaders on first use, which can take half a minute.
    const line =
      percent !== null
        ? t("phases.percent", { phase: label(phase), percent })
        : phase === "load"
          ? t("phases.firstLoad", { phase: label(phase) })
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
export function phasesSummary(phases: PhaseTiming[]): string {
  return phases
    .map(({ phase, seconds }) =>
      t("phases.seconds", { phase: label(phase), seconds: seconds.toFixed(1) }),
    )
    .join(" · ");
}
