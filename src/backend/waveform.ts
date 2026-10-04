import type * as bindings from "./bindings";
import { commands } from "./bindings";

export type Waveform = bindings.Waveform;

/** Takes the Waveform of the Current Resource's media with ffmpeg. */
export function extractWaveform(): Promise<Waveform> {
  return commands.extractWaveform();
}
