import { invoke } from "@tauri-apps/api/core";
import type * as bindings from "./bindings";

export type LogDirectory = bindings.LogDirectory;

export function logDirectory(): Promise<LogDirectory> {
  return invoke<LogDirectory>("log_directory");
}

/** Records `path` as the directory to write the log to from the next launch. */
export function chooseLogDirectory(path: string): Promise<LogDirectory> {
  return invoke<LogDirectory>("choose_log_directory", { path });
}

export type DebugLog = bindings.DebugLog;

export function debugLog(): Promise<DebugLog> {
  return invoke<DebugLog>("debug_log");
}

/** Records whether the Debug Log is written from the next launch. */
export function chooseDebugLog(hasDebugLog: boolean): Promise<DebugLog> {
  return invoke<DebugLog>("choose_debug_log", { hasDebugLog });
}

/** Opens the directory the log is written to now with the system's file manager. */
export function openLogDirectory(): Promise<void> {
  return invoke("open_log_directory");
}
