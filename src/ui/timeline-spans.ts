import type { Segment } from "#/ipc/project.ts";
import type { ChoiceSource } from "#/editor/index.ts";
import type { ChoiceLandings } from "#/ipc/preferences.ts";
import { MS_PER_SECOND, formatTime } from "#/ui/time.ts";

/**
 * Where Segments run on the Preview's timeline, in seconds, where a dragged one lands, and where
 * the media goes as another is chosen; kept apart from the waveform that draws them so the rules
 * hold without one.
 */

/** An edge of a Span, which a drag may move alone. */
export type SpanSide = "start" | "end";

/** Where a Segment runs on the timeline, in seconds. */
export interface Span {
  start: number;
  end: number;
}

/**
 * What a dragged Span may reach and land on: where its start stays between, how late its end may
 * go, and the times it Snaps to within `snapDistance`.
 */
export interface DragReach {
  lowestStart: number;
  highestStart: number;
  highestEnd: number;
  snapTimes: number[];
  snapDistance: number;
}

/** The time in `times` nearest `time` within `distance`, or `time` itself where none is. */
export function snapTime(
  time: number,
  times: number[],
  distance: number,
): number {
  let nearestTime = time;
  let nearestGap = distance;
  for (const candidate of times) {
    const gap = Math.abs(candidate - time);
    if (gap <= nearestGap) [nearestTime, nearestGap] = [candidate, gap];
  }
  return nearestTime;
}

export const toMilliseconds = (seconds: number) =>
  Math.round(seconds * MS_PER_SECOND);
export const toSeconds = (ms: number) => ms / MS_PER_SECOND;

/** The Lane a region lies in, counted from the bottom, of the `count` Lanes it shares with those it overlaps. */
export interface RegionLane {
  index: number;
  count: number;
}

/**
 * The Lane of each of `spans`, in the order they start: each lies in the lowest Lane free at its
 * start, and the spans overlapping one another share the Lanes they need; one overlapping none
 * has a Lane to itself.
 */
export function regionLanes(spans: Span[]): RegionLane[] {
  const lanes: RegionLane[] = [];
  let group: RegionLane[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  for (const { start, end } of spans) {
    if (start >= groupEnd) {
      for (const lane of group) lane.count = laneEnds.length;
      [group, laneEnds] = [[], []];
    }
    const freeLane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    const lane = {
      index: freeLane === -1 ? laneEnds.length : freeLane,
      count: 1,
    };
    laneEnds[lane.index] = end;
    groupEnd = group.length === 0 ? end : Math.max(groupEnd, end);
    group.push(lane);
    lanes.push(lane);
  }
  for (const lane of group) lane.count = laneEnds.length;
  return lanes;
}

/** `seconds` as the editor writes a time, so what the timeline reads can be typed into a Segment. */
export const formatSeconds = (seconds: number) =>
  formatTime(toMilliseconds(seconds));

/** How long `span` runs, in seconds to the millisecond. */
export const formatLength = ({ start, end }: Span) =>
  `${toSeconds(toMilliseconds(end - start)).toFixed(3)}s`;

/**
 * Where `span`, dragged by its `side` or, without one, as a whole, lands: Snapped to the nearest of
 * the reach's times, then kept within the reach, so it may overlap its neighbours but never starts
 * out of their order.
 */
export function landingSpan(
  span: Span,
  side: SpanSide | undefined,
  { lowestStart, highestStart, highestEnd, snapTimes, snapDistance }: DragReach,
): Span {
  const snap = (time: number) => snapTime(time, snapTimes, snapDistance);
  const clamp = (time: number, low: number, high: number) =>
    Math.min(high, Math.max(low, time));
  if (side === "start")
    return {
      start: clamp(
        snap(span.start),
        lowestStart,
        Math.min(highestStart, span.end),
      ),
      end: span.end,
    };
  if (side === "end")
    return {
      start: span.start,
      end: clamp(snap(span.end), span.start, highestEnd),
    };
  const length = span.end - span.start;
  const [offset = 0] = [
    snap(span.start) - span.start,
    snap(span.end) - span.end,
  ]
    .filter((offset) => offset !== 0)
    .sort((one, other) => Math.abs(one) - Math.abs(other));
  const start = clamp(
    span.start + offset,
    lowestStart,
    Math.min(highestStart, highestEnd - length),
  );
  return { start, end: start + length };
}

/** Where the media goes as another Segment is chosen, none to stay; and whether it pauses there. */
export interface Landing {
  at: number | null;
  isPausing: boolean;
}

/** What decides where the media goes as another Segment is chosen. */
export interface Choice {
  source: ChoiceSource;
  /** Where the Segment chosen starts. */
  start: number;
  /** Where its region was clicked, when chosen from it. */
  clicked?: number;
  isPaused: boolean;
  isPlayingAlone: boolean;
  /** The Choice Landing of each Choice Source, as the Preferences set them. */
  landings: ChoiceLandings;
}

/**
 * Where the media goes as another Segment is chosen: a paused media moves to it, to where its
 * region was clicked or else to its start. Playing alone keeps to the Segment chosen, so plays it
 * from its start; otherwise the Choice Landing of where it was chosen from says whether the media
 * pauses, and whether it moves to the start or stays, which for a region is where it was clicked.
 */
export function choiceLanding({
  source,
  start,
  clicked = start,
  isPaused,
  isPlayingAlone,
  landings,
}: Choice): Landing {
  if (isPaused)
    return { at: source === "region" ? clicked : start, isPausing: false };
  if (isPlayingAlone) return { at: start, isPausing: false };
  const { is_pausing, is_from_start } = landings[source];
  const stayPoint = source === "region" ? clicked : null;
  return { at: is_from_start ? start : stayPoint, isPausing: is_pausing };
}

/** Where `segment` runs on the timeline. */
export function spanOf(segment: Segment): Span {
  return { start: toSeconds(segment.start_ms), end: toSeconds(segment.end_ms) };
}
