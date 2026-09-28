import { invoke } from "@tauri-apps/api/core";

/** Where a ready Component was found. */
export type Origin = "choice" | "detection" | "bundled-variant";

export interface ComponentStatus {
  name: string;
  is_ready: boolean;
  path: string | null;
  origin: Origin | null;
  variant: string | null;
  problem: "not-installed" | "does-not-run" | null;
  /** The command that installs it, where the platform has one to name. */
  install: string | null;
}

export function componentStatuses(): Promise<ComponentStatus[]> {
  return invoke<ComponentStatus[]>("component_statuses");
}

export function chooseComponent(
  name: string,
  path: string,
): Promise<ComponentStatus[]> {
  return invoke<ComponentStatus[]>("choose_component", { name, path });
}

export function forgetComponent(name: string): Promise<ComponentStatus[]> {
  return invoke<ComponentStatus[]>("forget_component", { name });
}

export type ModelSlot = "transcription" | "vad" | "translation";

/** Where a Model Slot's Model comes from. */
export type ModelSource =
  | { kind: "file"; path: string }
  | { kind: "repository"; repo: string; file: string; commit: string };

export interface SlotView {
  source: ModelSource | null;
  /** Where the Model is expected. */
  path: string | null;
  has_file: boolean;
  /** The file extensions a Model for the slot has. */
  extensions: string[];
}

export type ModelSettingsView = Record<ModelSlot, SlotView>;

export function modelSettings(): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("model_settings");
}

export function chooseModel(
  slot: ModelSlot,
  source: ModelSource,
): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("choose_model", { slot, source });
}

/** A Model Tsuzuri was verified with, offered by name so nobody has to know where to find it. */
export interface PresetModel {
  slot: ModelSlot;
  name: string;
  quantization: string;
  source: ModelSource;
  size: number;
}

export function presetModels(): Promise<PresetModel[]> {
  return invoke<PresetModel[]>("preset_models");
}

/** How much of a Model being downloaded has arrived, as `model-download-progress` tells it. */
export interface DownloadProgress {
  repo: string;
  file: string;
  downloaded: number;
  total: number | null;
}

/** Downloads `file` of `repo` into the Hugging Face Cache, at the main branch when no `revision` is given. */
export function downloadModel(
  repo: string,
  file: string,
  revision: string | null = null,
): Promise<ModelSource> {
  return invoke<ModelSource>("download_model", { repo, file, revision });
}

/** A file of a Hugging Face Repository, by its path in the Repository. */
export interface RepositoryFile {
  path: string;
  size: number;
}

/** The files of `repo` at its main branch a Model for `slot` can be. */
export function repositoryFiles(
  repo: string,
  slot: ModelSlot,
): Promise<RepositoryFile[]> {
  return invoke<RepositoryFile[]>("repository_files", { repo, slot });
}

export function cancelModelDownload(repo: string, file: string): Promise<void> {
  return invoke<void>("cancel_model_download", { repo, file });
}
