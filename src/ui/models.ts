import type { ModelSource, PresetModel } from "../backend/toolchain";
import { fileName } from "./file-name";

/** How a Model Source is named to the user: a file by its path, a Repository's file by both. */
export function sourceName(source: ModelSource): string {
  return source.kind === "file" ? source.path : `${source.repo}/${source.file}`;
}

/** The name of a Model Source's file, without where it is kept. */
export function sourceFileName(source: ModelSource): string {
  return fileName(source.kind === "file" ? source.path : source.file);
}

/** A file's size as Hugging Face shows it, in decimal units. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** How a Preset Model is offered in a slot's menu: its name, quantization and size. */
export function presetLabel(preset: PresetModel): string {
  return `${preset.name} ${preset.quantization} · ${sizeLabel(preset.size)}`;
}

/** A file of a Hugging Face Repository, picked from it or downloaded. */
export interface HubFile {
  repo: string;
  file: string;
}
