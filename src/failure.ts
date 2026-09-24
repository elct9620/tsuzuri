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

const SLOTS = { transcription: "轉錄", translation: "翻譯" };

function isFailure(error: unknown): error is Failure {
  return typeof error === "object" && error !== null && "code" in error;
}

/** A sentence for a failed command; anything that is not a Failure, such as a plugin's error, is shown as it came. */
export function describeFailure(error: unknown): string {
  if (!isFailure(error)) return String(error);
  switch (error.code) {
    case "io":
      return `無法讀寫檔案（${error.detail}）`;
    case "malformed-srt":
      return `SRT 第 ${error.cue} 段無法讀取`;
    case "model-not-chosen":
      return `尚未指定${SLOTS[error.slot]}模型`;
    case "model-missing":
      return `找不到模型 ${error.path}，請重新指定`;
    case "component-not-ready":
      return `${error.component} 尚未就緒，請到設定確認`;
    case "step-failed":
      return `${error.step} 失敗：${error.detail}`;
    case "llama-exited":
      return "llama-server 在模型載入前結束";
    case "llama-timed-out":
      return "llama-server 未能及時載入模型";
    case "llama-request":
      return `翻譯請求失敗（${error.detail}）`;
    case "internal":
      return `內部錯誤（${error.detail}）`;
  }
}
