import { invoke } from "@tauri-apps/api/core";

/** The directory the log is written to in this launch, and the one chosen for the next. */
export interface LogDirectory {
  in_use: string;
  next_launch: string;
}

export function logDirectory(): Promise<LogDirectory> {
  return invoke<LogDirectory>("log_directory");
}

/** Records `path` as the directory to write the log to from the next launch. */
export function chooseLogDirectory(path: string): Promise<LogDirectory> {
  return invoke<LogDirectory>("choose_log_directory", { path });
}

/** Whether the Debug Log is written in this launch, and whether it is chosen for the next. */
export interface DebugLog {
  is_written_now: boolean;
  is_written_next_launch: boolean;
}

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
