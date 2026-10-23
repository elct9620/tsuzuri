import type * as bindings from "#/ipc/bindings.ts";
import { commands } from "#/ipc/bindings.ts";

export type ScannedScript = bindings.ScannedScript;

export type Registration = bindings.Registration;

export type ExportFormatRequest = bindings.ExportFormatRequest;

/** A Macro a Script registers, with the file of the Script it is in. */
export interface ScriptMacro {
  script: string;
  id: string;
  label: string;
}

/** An Export Format a Script registers, with the file of the Script it is in. */
export interface ScriptExportFormat extends ScriptMacro {
  extension: string;
}

/** What each of this machine's Scripts registers, loading again those changed since the last scan, or all when `isForced`. */
export function scanScripts(isForced: boolean): Promise<ScannedScript[]> {
  return commands.scanScripts(isForced);
}

/** The Macros `scripts` register, in the order they were found. */
export function scriptMacros(scripts: ScannedScript[]): ScriptMacro[] {
  return scripts.flatMap(({ name, registrations }) =>
    registrations.flatMap((registration) =>
      registration.kind === "macro"
        ? [{ script: name, id: registration.id, label: registration.label }]
        : [],
    ),
  );
}

/** The Export Formats `scripts` register, in the order they were found. */
export function scriptExportFormats(
  scripts: ScannedScript[],
): ScriptExportFormat[] {
  return scripts.flatMap(({ name, registrations }) =>
    registrations.flatMap((registration) =>
      registration.kind === "export-format"
        ? [
            {
              script: name,
              id: registration.id,
              label: registration.label,
              extension: registration.extension,
            },
          ]
        : [],
    ),
  );
}

/** Runs `macro` on the Current Resource, handing it the Checked Segments at `checkedSegments`. */
export async function runMacro(
  { script, id }: ScriptMacro,
  checkedSegments: number[],
): Promise<void> {
  await commands.runMacro(script, id, checkedSegments);
}

/** Writes to `path` the text the Export Format `request` names makes of the Current Resource. */
export async function runExportFormat(
  request: ExportFormatRequest,
  path: string,
): Promise<void> {
  await commands.runExportFormat(request, path);
}

/** Where an Export Format saves the Current Resource unless the user picks elsewhere. */
export function exportFormatPath(extension: string): Promise<string> {
  return commands.exportFormatPath(extension);
}

/** Opens this machine's Scripts folder with the system's file manager. */
export async function openScriptsDirectory(): Promise<void> {
  await commands.openScriptsDirectory();
}
