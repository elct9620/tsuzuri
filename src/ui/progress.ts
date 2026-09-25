import type { PhaseTiming, PipelineProgress } from "../backend/progress";
import { t } from "../i18n";

/** A Phase's name in the Interface Language. */
export function phaseLabel(phase: string): string {
  return t(`phases.${phase}`, { defaultValue: phase });
}

/** A readable line for one `pipeline-progress` event: the Phase with its percentage and count, when it has them. */
export function progressLine({
  phase,
  percent,
  count,
}: PipelineProgress): string {
  const label = phaseLabel(phase);
  if (percent !== null && count)
    return t("phases.count", { phase: label, percent, ...count });
  if (percent !== null) return t("phases.percent", { phase: label, percent });
  // Loading a Model compiles its GPU shaders on first use, which can take half a minute.
  if (phase === "load") return t("phases.firstLoad", { phase: label });
  return label;
}

/** Each Phase with its seconds, in the order it ran, as rows of a Notification. */
export function phaseItems(phases: PhaseTiming[]): [string, string][] {
  return phases.map(({ phase, seconds }) => [
    phaseLabel(phase),
    t("phases.seconds", { seconds: seconds.toFixed(1) }),
  ]);
}

/** The Phase with its percentage when it has one, short enough for a button. */
export function progressSummary({ phase, percent }: PipelineProgress): string {
  const label = phaseLabel(phase);
  return percent === null
    ? label
    : t("phases.percent", { phase: label, percent });
}
