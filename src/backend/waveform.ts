import { invoke } from "@tauri-apps/api/core";
import type * as bindings from "./bindings";

export type Waveform = bindings.Waveform;

/** Takes the Waveform of the Current Resource's media with ffmpeg. */
export function extractWaveform(): Promise<Waveform> {
  return invoke<Waveform>("extract_waveform");
}
