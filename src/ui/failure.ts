import type { Failure } from "#/ipc/failure.ts";
import { t } from "#/i18n.ts";
import type { NotificationKind } from "#/state/notification.svelte.ts";

/**
 * The kind of Notification each code comes as: a refusal, which asking again differently or later
 * will do, is a warning that goes on its own; a fault stays as an error until it is closed.
 */
const KIND_BY_CODE: Record<Failure["code"], NotificationKind> = {
  io: "error",
  "malformed-srt": "error",
  "glossary-without-header": "error",
  "malformed-glossary": "error",
  "model-not-chosen": "warning",
  "model-missing": "error",
  "model-not-downloaded": "warning",
  "model-download-failed": "error",
  "model-login-required": "warning",
  "repository-not-found": "warning",
  "model-download-cancelled": "warning",
  "model-downloading": "warning",
  "directory-not-found": "warning",
  "no-project": "warning",
  "no-resource": "warning",
  "no-media": "warning",
  "no-subtitle": "warning",
  "changed-elsewhere": "warning",
  "mode-running": "warning",
  "mode-cancelled": "warning",
  "no-translation-shown": "warning",
  "no-traditional-chinese": "warning",
  "invalid-times": "warning",
  "unordered-times": "warning",
  "invalid-pattern": "warning",
  "no-backup": "error",
  "no-row": "warning",
  "subtitle-exists": "warning",
  "component-not-ready": "error",
  "step-failed": "error",
  "update-failed": "error",
  "no-update": "warning",
  "update-during-mode": "warning",
  "opening-during-mode": "warning",
  "llama-exited": "error",
  "llama-timed-out": "error",
  "llama-request": "error",
  internal: "error",
};

function isFailure(error: unknown): error is Failure {
  return typeof error === "object" && error !== null && "code" in error;
}

/** The code of a Failure, or none for an error that is not one. */
export function failureCode(error: unknown): Failure["code"] | undefined {
  return isFailure(error) ? error.code : undefined;
}

/** The kind of Notification `error` comes as; anything that is not a Failure is a fault. */
export function failureKind(error: unknown): NotificationKind {
  return isFailure(error) ? KIND_BY_CODE[error.code] : "error";
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
    case "model-download-failed":
      return t("failures.modelDownloadFailed", { detail: error.detail });
    case "model-login-required":
      return t("failures.modelLoginRequired", { repo: error.repo });
    case "repository-not-found":
      return t("failures.repositoryNotFound", { repo: error.repo });
    case "model-download-cancelled":
      return t("failures.modelDownloadCancelled");
    case "model-downloading":
      return t("failures.modelDownloading");
    case "directory-not-found":
      return t("failures.directoryNotFound", { directory: error.directory });
    case "model-not-downloaded":
      return t("failures.modelNotDownloaded", {
        file: error.file,
        repo: error.repo,
      });
    case "no-project":
      return t("failures.noProject");
    case "no-resource":
      return t("failures.noResource");
    case "no-media":
      return t("failures.noMedia");
    case "no-subtitle":
      return t("failures.noSubtitle");
    case "changed-elsewhere":
      return t("failures.changedElsewhere");
    case "mode-running":
      return t("failures.modeRunning");
    case "mode-cancelled":
      return t("failures.cancelled");
    case "no-translation-shown":
      return t("failures.noTranslationShown");
    case "no-traditional-chinese":
      return t("failures.noTraditionalChinese");
    case "invalid-times":
      return t("failures.invalidTimes");
    case "unordered-times":
      return t("failures.unorderedTimes");
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
    case "update-failed":
      return t("failures.updateFailed", { detail: error.detail });
    case "no-update":
      return t("failures.noUpdate");
    case "update-during-mode":
      return t("failures.updateDuringMode");
    case "opening-during-mode":
      return t("failures.openingDuringMode");
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
