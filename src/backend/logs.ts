import { invoke } from "@tauri-apps/api/core";

/** The directory the log is written to in this launch, and the one chosen for the next. */
export interface LogDirectory {
  in_use: string;
  chosen: string;
}

export function logDirectory(): Promise<LogDirectory> {
  return invoke<LogDirectory>("log_directory");
}

/** Records `path` as the directory to write the log to from the next launch. */
export function chooseLogDirectory(path: string): Promise<LogDirectory> {
  return invoke<LogDirectory>("choose_log_directory", { path });
}

/** Opens the directory the log is written to now with the system's file manager. */
export function openLogDirectory(): Promise<void> {
  return invoke("open_log_directory");
}
