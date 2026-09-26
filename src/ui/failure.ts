import type { Failure } from "../backend/failure";
import { t } from "../i18n";

function isFailure(error: unknown): error is Failure {
  return typeof error === "object" && error !== null && "code" in error;
}

/** The code of a Failure, or none for an error that is not one. */
export function failureCode(error: unknown): Failure["code"] | undefined {
  return isFailure(error) ? error.code : undefined;
}

/** A sentence for a failed command; anything that is not a Failure, such as a plugin's error, is shown as it came. */
export function failureMessage(error: unknown): string {
  if (!isFailure(error)) return String(error);
  switch (error.code) {
    case "io":
      return t("failures.io", { detail: error.detail });
    case "malformed-srt":
      return t("failures.malformedSrt", { cue: error.cue });
    case "glossary-without-header":
      return t("failures.glossaryWithoutHeader");
    case "malformed-glossary":
      return t("failures.malformedGlossary", { detail: error.detail });
    case "model-not-chosen":
      return t("failures.modelNotChosen", { slot: t(`slots.${error.slot}`) });
    case "model-missing":
      return t("failures.modelMissing", { path: error.path });
    case "no-project":
      return t("failures.noProject");
    case "no-resource":
      return t("failures.noResource");
    case "no-media":
      return t("failures.noMedia");
    case "changed-elsewhere":
      return t("failures.changedElsewhere");
    case "mode-running":
      return t("failures.modeRunning");
    case "mode-cancelled":
      return t("failures.cancelled");
    case "no-translation-shown":
      return t("failures.noTranslationShown");
    case "invalid-times":
      return t("failures.invalidTimes");
    case "invalid-pattern":
      return t("failures.invalidPattern", { detail: error.detail });
    case "no-backup":
      return t("failures.noBackup", { backup: error.backup });
    case "no-row":
      return t("failures.noRow");
    case "subtitle-exists":
      return t("failures.subtitleExists", { path: error.path });
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
