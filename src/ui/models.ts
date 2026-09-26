import type { ModelSlot } from "../backend/toolchain";

/** The file extensions a Model for each slot is picked by. */
export const MODEL_EXTENSIONS: Record<ModelSlot, string[]> = {
  transcription: ["bin"],
  vad: ["bin"],
  translation: ["gguf"],
};
