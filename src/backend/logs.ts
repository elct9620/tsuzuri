import type * as bindings from "./bindings";
import { commands } from "./bindings";

export type LogDirectory = bindings.LogDirectory;

export function logDirectory(): Promise<LogDirectory> {
  return commands.logDirectory();
}

/** Records `path` as the directory to write the log to from the next launch. */
export function chooseLogDirectory(path: string): Promise<LogDirectory> {
  return commands.chooseLogDirectory(path);
}

export type DebugLog = bindings.DebugLog;

export function debugLog(): Promise<DebugLog> {
  return commands.debugLog();
}

/** Records whether the Debug Log is written from the next launch. */
export function chooseDebugLog(hasDebugLog: boolean): Promise<DebugLog> {
  return commands.chooseDebugLog(hasDebugLog);
}

/** Opens the directory the log is written to now with the system's file manager. */
export async function openLogDirectory(): Promise<void> {
  await commands.openLogDirectory();
}
