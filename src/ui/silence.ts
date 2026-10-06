/**
 * The silence a Resource without a media file plays under its Dummy Video, so the Preview and the
 * timeline follow the player's clock for a subtitle alone as they do for a media file.
 */
import type { ProjectView, Segment } from "#/backend/project.ts";
import { MS_PER_MINUTE, MS_PER_SECOND } from "#/ui/time.ts";

/** Room past the last Segment, so it can still be dragged later and a new one drawn after it. */
const ROOM_PAST_LAST_SEGMENT_MS = MS_PER_MINUTE;

/** The lowest rate Chromium plays, at one byte a sample: about 11 MB an hour. */
const SAMPLE_RATE = 3000;

/** An unsigned 8-bit sample is silent at the middle of its range. */
const SILENT_SAMPLE = 128;

const WAV_HEADER_BYTES = 44;

/** The Peaks of silence: one at nothing, stretched over however long the silence lasts. */
export const SILENT_PEAKS = [0];

/** The silence of a Resource without a media file, lasting `lengthMs`. */
export type Silence = { resource: string; lengthMs: number };

/** What the Preview plays: a media file by its path, or the silence of a Resource without one. */
export type PlayedSource = { media: string } | Silence;

/**
 * What the Preview plays for `project` while it plays `current`: the media file, or the silence of
 * a Resource without one, or null with no Current Resource. The silence it plays is kept until a
 * Segment reaches its end, and then made a minute past the last Segment again, since making it
 * anew reloads the player and the timeline.
 */
export function playedSource(
  project: ProjectView | null,
  current: PlayedSource | null,
): PlayedSource | null {
  if (project === null) return null;
  if (project.media) return { media: project.media };
  const resource = project.current_resource;
  if (resource === null) return null;
  const lastEndMs = lastEndOf(project.segments);
  return isSilenceOf(current, resource) && lastEndMs < current.lengthMs
    ? current
    : { resource, lengthMs: lastEndMs + ROOM_PAST_LAST_SEGMENT_MS };
}

/** Whether `source` is the silence of `resource`. */
export function isSilenceOf(
  source: PlayedSource | null,
  resource: string,
): source is Silence {
  return (
    source !== null && "resource" in source && source.resource === resource
  );
}

/** Where the last of `segments` to end ends, 0 without any. */
function lastEndOf(segments: readonly Segment[]): number {
  return Math.max(0, ...segments.map((segment) => segment.end_ms));
}

export function isSameSource(
  one: PlayedSource | null,
  other: PlayedSource | null,
): boolean {
  if (one === null || other === null) return one === other;
  if ("media" in one) return "media" in other && one.media === other.media;
  return (
    "resource" in other &&
    one.resource === other.resource &&
    one.lengthMs === other.lengthMs
  );
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
