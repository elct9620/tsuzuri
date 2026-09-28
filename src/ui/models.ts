import type { ModelSource } from "../backend/toolchain";
import { fileName } from "./file_name";

/** How a Model Source is named to the user: a file by its path, a Repository's file by both. */
export function sourceName(source: ModelSource): string {
  return source.kind === "file" ? source.path : `${source.repo}/${source.file}`;
}

/** The name of a Model Source's file, without where it is kept. */
export function sourceFileName(source: ModelSource): string {
  return fileName(source.kind === "file" ? source.path : source.file);
}
