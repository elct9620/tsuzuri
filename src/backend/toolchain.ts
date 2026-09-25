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

export type ModelSlot = "transcription" | "translation";

export interface SlotView {
  path: string | null;
  has_file: boolean;
}

export type ModelSettingsView = Record<ModelSlot, SlotView>;

export function modelSettings(): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("model_settings");
}

export function chooseModel(
  slot: ModelSlot,
  path: string,
): Promise<ModelSettingsView> {
  return invoke<ModelSettingsView>("choose_model", { slot, path });
}
