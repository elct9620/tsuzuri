import { t } from "./i18n";

/** Why a command did not finish, as the backend sends it: a code and the data it names. */
export type Failure =
  | { code: "io"; detail: string }
  | { code: "malformed-srt"; cue: number }
  | { code: "model-not-chosen"; slot: "transcription" | "translation" }
  | { code: "model-missing"; path: string }
  | { code: "component-not-ready"; component: string }
  | { code: "step-failed"; step: string; detail: string }
  | { code: "llama-exited" }
  | { code: "llama-timed-out" }
  | { code: "llama-request"; detail: string }
  | { code: "internal"; detail: string };

function isFailure(error: unknown): error is Failure {
  return typeof error === "object" && error !== null && "code" in error;
}

/** A sentence for a failed command; anything that is not a Failure, such as a plugin's error, is shown as it came. */
export function describeFailure(error: unknown): string {
  if (!isFailure(error)) return String(error);
  switch (error.code) {
    case "io":
      return t("failures.io", { detail: error.detail });
    case "malformed-srt":
      return t("failures.malformedSrt", { cue: error.cue });
    case "model-not-chosen":
      return t("failures.modelNotChosen", { slot: t(`slots.${error.slot}`) });
    case "model-missing":
      return t("failures.modelMissing", { path: error.path });
    case "component-not-ready":
      return t("failures.componentNotReady", { component: error.component });
    case "step-failed":
      return t("failures.stepFailed", {
        step: t(`phases.${error.step}`, { defaultValue: error.step }),
        detail: error.detail,
      });
    case "llama-exited":
      return t("failures.llamaExited");
    case "llama-timed-out":
      return t("failures.llamaTimedOut");
    case "llama-request":
      return t("failures.llamaRequest", { detail: error.detail });
    case "internal":
      return t("failures.internal", { detail: error.detail });
  }
}
