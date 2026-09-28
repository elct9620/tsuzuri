import type { ModelSlot, ModelSource } from "../backend/toolchain";
import { fileName } from "./file_name";

/** The file extensions a Model for each slot is picked by. */
export const MODEL_EXTENSIONS: Record<ModelSlot, string[]> = {
  transcription: ["bin"],
  vad: ["bin"],
  translation: ["gguf"],
};

/** How a Model Source is named to the user: a file by its path, a Repository's file by both. */
export function sourceName(source: ModelSource): string {
  return source.kind === "file" ? source.path : `${source.repo}/${source.file}`;
}

/** The name of a Model Source's file, without where it is kept. */
export function sourceFileName(source: ModelSource): string {
  return fileName(source.kind === "file" ? source.path : source.file);
}
