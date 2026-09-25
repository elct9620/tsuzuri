/** Why a command did not finish, as the backend sends it: a code and the data it names. */
export type Failure =
  | { code: "io"; detail: string }
  | { code: "malformed-srt"; cue: number }
  | { code: "glossary-without-header" }
  | { code: "malformed-glossary"; detail: string }
  | { code: "model-not-chosen"; slot: "transcription" | "translation" }
  | { code: "model-missing"; path: string }
  | { code: "no-project" }
  | { code: "no-resource" }
  | { code: "no-media" }
  | { code: "changed-elsewhere" }
  | { code: "mode-running" }
  | { code: "mode-cancelled" }
  | { code: "invalid-times" }
  | { code: "no-backup"; backup: string }
  | { code: "no-row"; row: number }
  | { code: "subtitle-exists"; path: string }
  | { code: "component-not-ready"; component: string }
  | { code: "step-failed"; step: string; detail: string }
  | { code: "llama-exited" }
  | { code: "llama-timed-out" }
  | { code: "llama-request"; detail: string }
  | { code: "internal"; detail: string };
