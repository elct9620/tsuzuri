import { invoke } from "@tauri-apps/api/core";
import type * as bindings from "./bindings";

export type Origin = bindings.Origin;

export type ComponentStatus = bindings.ComponentStatus;

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

export type ModelSlot = bindings.ModelSlot;

export type ModelSource = bindings.ModelSource;

export type SlotView = bindings.SlotView;

export type ModelSettingsView = bindings.ModelSettingsView;

export function modelSettings(): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("model_settings");
}

export function chooseModel(
  slot: ModelSlot,
  source: ModelSource,
): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("choose_model", { slot, source });
}

export type PresetModel = bindings.PresetModel;

/** The Preset Models of `slot`, in the order the settings offer them. */
export function presetModels(slot: ModelSlot): Promise<PresetModel[]> {
  return invoke<PresetModel[]>("preset_models", { slot });
}

export type DownloadProgress = bindings.DownloadProgress;

/** Downloads `file` of `repo` into the Hugging Face Cache, at the main branch when no `revision` is given. */
export function downloadModel(
  repo: string,
  file: string,
  revision: string | null = null,
): Promise<ModelSource> {
  return invoke<ModelSource>("download_model", { repo, file, revision });
}

export type RepositoryFile = bindings.RepositoryFile;

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
