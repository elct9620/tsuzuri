import type * as bindings from "#/ipc/bindings.ts";
import { commands } from "#/ipc/bindings.ts";

export type Waveform = bindings.Waveform;

/** Takes the Waveform of the Current Resource's media with ffmpeg. */
export function extractWaveform(): Promise<Waveform> {
  return commands.extractWaveform();
}
