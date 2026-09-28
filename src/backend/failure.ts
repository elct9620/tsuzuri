import type { ModelSlot } from "./toolchain";

/** Why a command did not finish, as the backend sends it: a code and the data it names. */
export type Failure =
  | { code: "io"; detail: string }
  | { code: "malformed-srt"; cue: number }
  | { code: "glossary-without-header" }
  | { code: "malformed-glossary"; detail: string }
  | { code: "model-not-chosen"; slot: ModelSlot }
  | { code: "model-missing"; path: string }
  | { code: "model-not-downloaded"; repo: string; file: string }
  | { code: "model-download-failed"; detail: string }
  | { code: "model-download-cancelled" }
  | { code: "model-downloading" }
  | { code: "no-project" }
  | { code: "no-resource" }
  | { code: "no-media" }
  | { code: "changed-elsewhere" }
  | { code: "mode-running" }
  | { code: "mode-cancelled" }
  | { code: "no-translation-shown" }
  | { code: "no-traditional-chinese" }
  | { code: "invalid-times" }
  | { code: "unordered-times" }
  | { code: "invalid-pattern"; detail: string }
  | { code: "no-backup"; backup: string }
  | { code: "no-row"; row: number }
  | { code: "subtitle-exists"; path: string }
  | { code: "component-not-ready"; component: string }
  | { code: "step-failed"; step: string; detail: string }
  | { code: "update-failed"; detail: string }
  | { code: "no-update" }
  | { code: "update-during-mode" }
  | { code: "llama-exited" }
  | { code: "llama-timed-out" }
  | { code: "llama-request"; detail: string }
  | { code: "internal"; detail: string };
