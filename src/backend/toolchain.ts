import type * as bindings from "./bindings";
import { commands } from "./bindings";

export type Origin = bindings.Origin;

export type ComponentStatus = bindings.ComponentStatus;

export function componentStatuses(): Promise<ComponentStatus[]> {
  return commands.componentStatuses();
}

export function chooseComponent(
  name: string,
  path: string,
): Promise<ComponentStatus[]> {
  return commands.chooseComponent(name, path);
}

export function forgetComponent(name: string): Promise<ComponentStatus[]> {
  return commands.forgetComponent(name);
}

export type ModelSlot = bindings.ModelSlot;

export type ModelSource = bindings.ModelSource;

export type SlotView = bindings.SlotView;

export type ModelSettingsView = bindings.ModelSettingsView;

export function modelSettings(): Promise<ModelSettingsView> {
  return commands.modelSettings();
}

export function chooseModel(
  slot: ModelSlot,
  source: ModelSource,
): Promise<ModelSettingsView> {
  return commands.chooseModel(slot, source);
}

export type PresetModel = bindings.PresetModel;

/** The Preset Models of `slot`, in the order the settings offer them. */
export function presetModels(slot: ModelSlot): Promise<PresetModel[]> {
  return commands.presetModels(slot);
}

export type DownloadProgress = bindings.DownloadProgress;

/** Downloads `file` of `repo` into the Hugging Face Cache, at the main branch when no `revision` is given. */
export function downloadModel(
  repo: string,
  file: string,
  revision: string | null = null,
): Promise<ModelSource> {
  return commands.downloadModel(repo, file, revision);
}

export type RepositoryFile = bindings.RepositoryFile;

/** The files of `repo` at its main branch a Model for `slot` can be. */
export function repositoryFiles(
  repo: string,
  slot: ModelSlot,
): Promise<RepositoryFile[]> {
  return commands.repositoryFiles(repo, slot);
}

export async function cancelModelDownload(
  repo: string,
  file: string,
): Promise<void> {
  await commands.cancelModelDownload(repo, file);
}
