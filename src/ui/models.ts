import type { ModelSlot, ModelSource } from "../backend/toolchain";
import { fileName } from "./file_name";

/** How a Model Source is named to the user: a file by its path, a Repository's file by both. */
export function sourceName(source: ModelSource): string {
  return source.kind === "file" ? source.path : `${source.repo}/${source.file}`;
}

/** The name of a Model Source's file, without where it is kept. */
export function sourceFileName(source: ModelSource): string {
  return fileName(source.kind === "file" ? source.path : source.file);
}

/** Whether `a` and `b` name the same Model. */
export function isSameSource(a: ModelSource, b: ModelSource): boolean {
  if (a.kind === "file" || b.kind === "file")
    return a.kind === "file" && b.kind === "file" && a.path === b.path;
  return a.repo === b.repo && a.file === b.file && a.commit === b.commit;
}

/** A file's size as Hugging Face shows it, in decimal units. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** What a slot's row announces as `model-slot:choose`: the Model Source it chose, or none. */
export interface ModelChoice {
  slot: ModelSlot;
  source: ModelSource | null;
}
