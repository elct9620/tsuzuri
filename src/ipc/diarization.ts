import type * as bindings from "#/ipc/bindings.ts";
import { commands } from "#/ipc/bindings.ts";

export type Diarization = bindings.Diarization;

/** Gives the Current Resource's Segments the Speakers heard in its media file. */
export function diarize(): Promise<Diarization> {
  return commands.diarize();
}
