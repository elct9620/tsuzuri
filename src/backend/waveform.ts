import { invoke } from "@tauri-apps/api/core";

/** How loud a media file is over time, one Peak from 0 to 1 for each `1 / peaks_per_second` of it. */
export interface Waveform {
  /** The media file it was taken from. */
  media: string;
  peaks_per_second: number;
  peaks: number[];
}

/** Takes the Waveform of the Current Resource's media with ffmpeg. */
export function extractWaveform(): Promise<Waveform> {
  return invoke<Waveform>("extract_waveform");
}
