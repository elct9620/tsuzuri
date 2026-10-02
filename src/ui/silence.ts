/**
 * The silence a Resource without a media file plays under its Dummy Video, so the Preview and the
 * timeline follow the player's clock for a subtitle alone as they do for a media file.
 */
import type { ProjectView, Segment } from "../backend/project";
import { MS_PER_MINUTE, MS_PER_SECOND } from "./time";

/** Room past the last Segment, so it can still be dragged later and a new one drawn after it. */
const ROOM_PAST_LAST_SEGMENT_MS = MS_PER_MINUTE;

/** The lowest rate Chromium plays, at one byte a sample: about 11 MB an hour. */
const SAMPLE_RATE = 3000;

/** An unsigned 8-bit sample is silent at the middle of its range. */
const SILENT_SAMPLE = 128;

const WAV_HEADER_BYTES = 44;

/**
 * What the Preview plays for `project`, named so that a change of it can be seen: the media
 * file's path, the silence of a Resource without one, or null with no Current Resource.
 */
export function playedSource(project: ProjectView | null): string | null {
  if (project?.media) return project.media;
  const resource = project?.current_resource ?? null;
  return resource === null ? null : `silence:${resource}`;
}

/** The Peaks of silence: one at nothing, stretched over however long the silence lasts. */
export const SILENT_PEAKS = [0];

/** How long the silence under `segments` lasts: a minute past the last one to end. */
export function silenceLengthMs(segments: readonly Segment[]): number {
  const lastEnd = Math.max(0, ...segments.map((segment) => segment.end_ms));
  return lastEnd + ROOM_PAST_LAST_SEGMENT_MS;
}

/** A WAV of silence lasting `lengthMs`: mono, unsigned 8-bit PCM at the lowest rate every webview plays. */
export function silentWav(lengthMs: number): Blob {
  const dataBytes = Math.ceil((lengthMs / MS_PER_SECOND) * SAMPLE_RATE);
  const header = new DataView(new ArrayBuffer(WAV_HEADER_BYTES));
  const writeTag = (offset: number, tag: string) =>
    [...tag].forEach((char, index) =>
      header.setUint8(offset + index, char.charCodeAt(0)),
    );
  writeTag(0, "RIFF");
  header.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  header.setUint32(16, 16, true); // the size of a PCM format chunk
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE, true); // bytes a second at one byte a sample
  header.setUint16(32, 1, true); // bytes a frame
  header.setUint16(34, 8, true); // bits a sample
  writeTag(36, "data");
  header.setUint32(40, dataBytes, true);
  return new Blob([header, new Uint8Array(dataBytes).fill(SILENT_SAMPLE)], {
    type: "audio/wav",
  });
}
