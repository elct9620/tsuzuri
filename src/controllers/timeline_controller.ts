import { Controller } from "@hotwired/stimulus";
import WaveSurfer from "wavesurfer.js";
import HoverPlugin from "wavesurfer.js/plugins/hover";
import RegionsPlugin, {
  type Region,
  type UpdateSide,
} from "wavesurfer.js/plugins/regions";
import TimelinePlugin from "wavesurfer.js/plugins/timeline";

import type { ProjectFeed, ProjectView, Segment } from "../backend/project";
import { extractWaveform, type Waveform } from "../backend/waveform";
import type { EditingSession, SegmentChange } from "../editor";
import { t } from "../i18n";
import { notifyEdit, notifyFailure } from "../ui/notification";
import { formatTime } from "../ui/time";

const INITIAL_PX_PER_SEC = 100;
/** The time scale's height, which the page leaves free beneath the waveform. */
const TIMELINE_HEIGHT = 20;
const ZOOM_FACTOR = 2;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 1600;
/** How far the wheel turns to zoom by a factor of e; a pinch reports small steps, a mouse wheel about 100. */
const WHEEL_ZOOM_SCALE = 200;

const REGION_COLORS = ["--segment-even", "--segment-odd"];
/** How near, in pixels, an edge dragged on the timeline comes to a time before it Snaps to it. */
const SNAP_PX = 8;
/** The id of the range drawn on the empty waveform, which is no Segment's region. */
const RANGE_ID = "range";

/** Where a Segment runs on the timeline, in seconds. */
interface Span {
  start: number;
  end: number;
}

/**
 * What a dragged Span may reach and land on: the times it stays within, and the times it Snaps to
 * within `snapDistance`.
 */
interface DragReach {
  lowest: number;
  highest: number;
  snapTimes: number[];
  snapDistance: number;
}

/** The time in `times` nearest `time` within `distance`, or `time` itself where none is. */
function snapTime(time: number, times: number[], distance: number): number {
  let nearest = time;
  let nearestGap = distance;
  for (const candidate of times) {
    const gap = Math.abs(candidate - time);
    if (gap <= nearestGap) [nearest, nearestGap] = [candidate, gap];
  }
  return nearest;
}

const toMilliseconds = (seconds: number) => Math.round(seconds * 1000);

/** `seconds` as the editor writes a time, so what the timeline reads can be typed into a Segment. */
const formatSeconds = (seconds: number) => formatTime(toMilliseconds(seconds));

/** How long `span` runs, in seconds to the millisecond. */
const formatLength = ({ start, end }: Span) =>
  `${(toMilliseconds(end - start) / 1000).toFixed(3)}s`;

/**
 * Where `span`, dragged by its `side` or, without one, as a whole, lands: Snapped to the nearest of
 * the reach's times, then kept within its lowest and highest, so it is never dragged over another.
 */
function landingSpan(
  span: Span,
  side: UpdateSide | undefined,
  { lowest, highest, snapTimes, snapDistance }: DragReach,
): Span {
  const snap = (time: number) => snapTime(time, snapTimes, snapDistance);
  const clamp = (time: number, low: number, high: number) =>
    Math.min(high, Math.max(low, time));
  if (side === "start")
    return { start: clamp(snap(span.start), lowest, span.end), end: span.end };
  if (side === "end")
    return {
      start: span.start,
      end: clamp(snap(span.end), span.start, highest),
    };
  const length = span.end - span.start;
  const [offset = 0] = [
    snap(span.start) - span.start,
    snap(span.end) - span.end,
  ]
    .filter((offset) => offset !== 0)
    .sort((one, other) => Math.abs(one) - Math.abs(other));
  const start = clamp(span.start + offset, lowest, highest - length);
  return { start, end: start + length };
}

/** A drag of the Current Segment's region under way, from its Segment's times to where it is shown. */
interface Drag {
  index: number;
  /** The edge dragged, or none for the whole region. */
  side: UpdateSide | undefined;
  origin: Span;
  /** Where the pointer has taken the region, before it Snaps or is kept from its neighbours. */
  pointerSpan: Span;
  /** Where the region is shown now. */
  span: Span;
  /** Whether the edge it shares with the neighbour on its dragged side moves along with it. */
  isShared: boolean;
  isCancelled: boolean;
}

/**
 * The colour of the Segment at `index`, as the waveform's element defines it: neighbours take
 * turns, so where one ends and the next begins shows, and the Current Segment is stronger.
 */
export function regionColor(index: number, isCurrent = false): string {
  if (isCurrent) return "var(--segment-current)";
  return `var(${REGION_COLORS[index % REGION_COLORS.length]})`;
}

const CONTROL_SELECTOR =
  "input, select, textarea, button, summary, [contenteditable], [role=button]";

/**
 * Routes a key event by whether a control has the focus: `:!control` leaves a key to the field,
 * input or button it was pressed in, which Space types into or presses.
 */
export function controlOption({
  event,
  value,
}: {
  event: Event;
  value: boolean;
}): boolean {
  const isControl =
    event.target instanceof Element &&
    event.target.closest(CONTROL_SELECTOR) !== null;
  return isControl === value;
}

/**
 * The Preview's timeline: the Waveform of the Current Resource's media with a region for each
 * Segment, where the Current Segment is retimed by dragging and a new one drawn on the empty waveform.
 */
export default class TimelineController extends Controller {
  static targets = ["media", "waveform", "zoomLevel", "snapping", "times"];

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;
  declare readonly mediaTarget: HTMLMediaElement;
  declare readonly waveformTarget: HTMLElement;
  /** How far the timeline is zoomed, as a percentage of where it starts; pressing it goes back there. */
  declare readonly zoomLevelTarget: HTMLElement;
  /** Whether a dragged edge Snaps, pressed to turn it on or off. */
  declare readonly snappingTarget: HTMLButtonElement;
  /** The times a dragged region or a drawn range will be written with, shown only while there is one. */
  declare readonly timesTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  /** Whether a running Mode holds the Current Resource, which refuses every Segment Change. */
  private isHeld = false;
  private pxPerSec = INITIAL_PX_PER_SEC;
  private isSnapping = true;
  /** The modifier keys held as the pointer last moved, which a region's own events do not carry. */
  private modifiers = { shiftKey: false, altKey: false };
  private drag: Drag | null = null;
  /** The range drawn on the empty waveform, waiting for Enter to become a Segment or Esc to go. */
  private range: Region | null = null;
  private surfer?: WaveSurfer;
  private regions?: ReturnType<typeof RegionsPlugin.create>;
  private unfollow?: () => void;
  private readonly followModifiers = (event: PointerEvent) => {
    this.modifiers = { shiftKey: event.shiftKey, altKey: event.altKey };
  };

  connect(): void {
    this.showZoomLevel();
    this.showSnapping();
    // Capturing, so the modifiers are known before a region hears the same move
    window.addEventListener("pointerdown", this.followModifiers, true);
    window.addEventListener("pointermove", this.followModifiers, true);
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    window.removeEventListener("pointerdown", this.followModifiers, true);
    window.removeEventListener("pointermove", this.followModifiers, true);
    this.unfollow?.();
    this.surfer?.destroy();
  }

  zoomIn(): void {
    this.zoomTo(this.pxPerSec * ZOOM_FACTOR);
  }

  resetZoom(): void {
    this.zoomTo(INITIAL_PX_PER_SEC);
  }

  zoomOut(): void {
    this.zoomTo(this.pxPerSec / ZOOM_FACTOR);
  }

  toggleSnapping(): void {
    this.isSnapping = !this.isSnapping;
    this.showSnapping();
  }

  /** Stops the media when it plays, or else plays the Current Segment alone. */
  playCurrent(): void {
    if (!this.mediaTarget.paused) {
      this.mediaTarget.pause();
      return;
    }
    const segment = this.currentSegment;
    if (segment)
      void this.surfer?.play(segment.start_ms / 1000, segment.end_ms / 1000);
  }

  /** Colours the Current Segment's region, the only one that can be dragged. */
  showCursor(): void {
    this.colorRegions();
  }

  /**
   * Sets the Current Segment's start where the media is with F11, or its end with F12, as Subtitle
   * Edit binds them; the time stays clear of its neighbours as a dragged edge does.
   */
  setTimeAtMedia(event: KeyboardEvent): void {
    const side = { F11: "start", F12: "end" }[event.key] as
      UpdateSide | undefined;
    const index = this.session.cursor.index;
    const segment = this.currentSegment;
    if (!side || index === null || !segment || this.isHeld) return;
    event.preventDefault();
    const time = this.mediaTarget.currentTime;
    const { lowest, highest } = this.dragReach(index, false);
    const span = spanOf(segment);
    void this.retime(
      index,
      side === "start"
        ? { start: Math.max(lowest, time), end: span.end }
        : { start: span.start, end: Math.min(highest, time) },
    );
  }

  /** Takes a drag back to where it began, or drops the drawn range. */
  cancel(): void {
    if (this.drag) {
      this.drag.isCancelled = true;
      this.showSpan(this.drag, this.drag.origin);
      return;
    }
    this.dropRange();
  }

  /** Inserts a Segment over the drawn range with Enter. */
  insertRange(event: KeyboardEvent): void {
    const range = this.range;
    if (!range) return;
    event.preventDefault();
    this.dropRange();
    void this.change({
      kind: "insertion",
      start_ms: toMilliseconds(range.start),
      end_ms: toMilliseconds(range.end),
    });
  }

  /**
   * Scrolls the timeline, or zooms it while Ctrl (Windows), Alt (as Subtitle Edit does) or ⌘ is
   * held; a trackpad pinch reports itself as Ctrl.
   */
  scrollOrZoom(event: WheelEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      this.zoomTo(this.pxPerSec * Math.exp(-event.deltaY / WHEEL_ZOOM_SCALE));
      return;
    }
    this.surfer?.setScroll(
      this.surfer.getScroll() + event.deltaX + event.deltaY,
    );
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
    this.isHeld = (project?.running_mode ?? null) !== null;
    // Redrawing takes the dragged region away, so a drag cannot outlive the Segments it began on
    this.drag = null;
    this.range = null;
    this.showTimes(null);
    const media = project?.media ?? null;
    if (media === this.media) {
      this.markSegments();
      return;
    }
    this.media = media;
    void this.loadWaveform(media);
  }

  private async loadWaveform(media: string | null): Promise<void> {
    this.surfer?.destroy();
    this.surfer = undefined;
    this.regions = undefined;
    this.waveformTarget.hidden = media === null;
    if (media === null) return;
    this.waveformTarget.classList.add("skeleton");
    try {
      const waveform = await extractWaveform();
      if (waveform.media === this.media) this.drawWaveform(waveform);
    } catch (error) {
      if (media === this.media) notifyFailure(t("preview.noWaveform"), error);
    } finally {
      if (media === this.media)
        this.waveformTarget.classList.remove("skeleton");
    }
  }

  private drawWaveform(waveform: Waveform): void {
    const regions = RegionsPlugin.create();
    this.regions = regions;
    regions.on("region-clicked", (region) => {
      if (region.id !== RANGE_ID)
        this.makeCurrent(regions.getRegions().indexOf(region));
    });
    regions.on("region-update", (region, side) => this.follow(region, side));
    regions.on("region-updated", () => this.letGo());
    regions.on("region-initialized", (region) => {
      if (region.id === RANGE_ID)
        region.on("update", () => this.showTimes(region, true));
    });
    regions.on("region-created", (region) => {
      if (region.id === RANGE_ID) this.keepRange(region);
    });
    this.surfer = WaveSurfer.create({
      container: this.waveformTarget,
      media: this.mediaTarget,
      peaks: [waveform.peaks],
      duration: waveform.peaks.length / waveform.peaks_per_second,
      height: "auto",
      normalize: true,
      hideScrollbar: true,
      minPxPerSec: this.pxPerSec,
      waveColor: this.themeColor("--color-base-content", "#888"),
      progressColor: this.themeColor("--color-primary", "#555"),
      cursorColor: this.themeColor("--color-primary", "#555"),
      plugins: [
        regions,
        TimelinePlugin.create({ height: TIMELINE_HEIGHT }),
        HoverPlugin.create({
          lineColor: this.themeColor("--color-neutral", "#333"),
          labelBackground: this.themeColor("--color-neutral", "#333"),
          labelColor: this.themeColor("--color-neutral-content", "#fff"),
          formatTimeCallback: formatSeconds,
        }),
      ],
    });
    this.surfer.on("ready", () => this.markSegments());
    this.surfer.on("interaction", () => this.dropRange());
    regions.enableDragSelection({
      id: RANGE_ID,
      color: "var(--segment-range)",
      drag: false,
      resize: false,
    });
  }

  private markSegments(): void {
    if (!this.regions) return;
    this.regions.clearRegions();
    this.segments.forEach((segment, index) =>
      this.regions!.addRegion({
        ...spanOf(segment),
        ...this.regionLook(index),
      }),
    );
  }

  private get currentSegment(): Segment | undefined {
    const index = this.session.cursor.index;
    return index === null ? undefined : this.segments[index];
  }

  private makeCurrent(index: number): void {
    this.session.makeCurrent(index);
  }

  private colorRegions(): void {
    this.segmentRegions().forEach((region, index) =>
      region.setOptions(this.regionLook(index)),
    );
  }

  /**
   * How the Segment at `index` shows: its colour, and whether it can be dragged, which only the
   * Current Segment can.
   */
  private regionLook(index: number) {
    const isCurrent = index === this.session.cursor.index;
    const isMovable = isCurrent && !this.isHeld;
    return {
      color: regionColor(index, isCurrent),
      drag: isMovable,
      resize: isMovable,
    };
  }

  private segmentRegions(): Region[] {
    return (
      this.regions?.getRegions().filter((region) => region.id !== RANGE_ID) ??
      []
    );
  }

  /** Follows a region as it is dragged: Snapped, kept from its neighbours and shown there. */
  private follow(region: Region, side: UpdateSide | undefined): void {
    const index = this.segmentRegions().indexOf(region);
    const segment = this.segments[index];
    if (!segment) return;
    this.drag ??= {
      index,
      side,
      origin: spanOf(segment),
      pointerSpan: spanOf(segment),
      span: spanOf(segment),
      isShared: false,
      isCancelled: false,
    };
    const drag = this.drag;
    if (drag.isCancelled) {
      this.showSpan(drag, drag.origin);
      return;
    }
    drag.pointerSpan = {
      start: drag.pointerSpan.start + region.start - drag.span.start,
      end: drag.pointerSpan.end + region.end - drag.span.end,
    };
    drag.isShared =
      this.modifiers.altKey &&
      side !== undefined &&
      this.sharedNeighbour(index, side) !== null;
    const reach = this.dragReach(index, drag.isShared, side);
    const isSnapping = this.isSnapping !== this.modifiers.shiftKey;
    this.showSpan(
      drag,
      landingSpan(
        drag.pointerSpan,
        side,
        isSnapping ? reach : { ...reach, snapTimes: [] },
      ),
    );
  }

  /** Writes where a region was let go, unless the drag was taken back or ended where it began. */
  private letGo(): void {
    const drag = this.drag;
    this.drag = null;
    this.showTimes(this.range);
    if (!drag || drag.isCancelled) return;
    const { index, side, span } = drag;
    if (!drag.isShared || side === undefined) {
      void this.retime(index, span);
      return;
    }
    const at = side === "end" ? span.end : span.start;
    if (at === drag.origin[side]) return;
    void this.change({
      kind: "boundary",
      index: side === "end" ? index : index - 1,
      at_ms: toMilliseconds(at),
    });
  }

  /** Shows `span` for the dragged region, and for the neighbour whose edge moves with it. */
  private showSpan(drag: Drag, span: Span): void {
    const regions = this.segmentRegions();
    regions[drag.index]?.setOptions(span);
    drag.span = span;
    this.showTimes(span, true);
    for (const side of ["start", "end"] as const) {
      const neighbour = this.sharedNeighbour(drag.index, side);
      if (neighbour === null) continue;
      const segment = spanOf(this.segments[neighbour]);
      regions[neighbour]?.setOptions(
        !drag.isShared || drag.isCancelled
          ? segment
          : side === "end"
            ? { start: span.end, end: segment.end }
            : { start: segment.start, end: span.start },
      );
    }
  }

  /** The neighbour on `side` of the Segment at `index` whose edge touches it, or none. */
  private sharedNeighbour(index: number, side: UpdateSide): number | null {
    const segment = this.segments[index];
    const neighbour = side === "end" ? index + 1 : index - 1;
    const other = this.segments[neighbour];
    if (!segment || !other) return null;
    const isTouching =
      side === "end"
        ? other.start_ms === segment.end_ms
        : other.end_ms === segment.start_ms;
    return isTouching ? neighbour : null;
  }

  /**
   * What the Segment at `index` may reach: from its previous neighbour's end to its next's start,
   * or across the neighbour whose shared edge moves with it; and what it Snaps to.
   */
  private dragReach(
    index: number,
    isShared: boolean,
    side?: UpdateSide,
  ): DragReach {
    const segment = spanOf(this.segments[index]);
    const previous = this.segments[index - 1];
    const next = this.segments[index + 1];
    const duration = this.surfer?.getDuration() ?? Infinity;
    const lowest = !previous
      ? 0
      : isShared && side === "start"
        ? previous.start_ms / 1000
        : Math.min(previous.end_ms / 1000, segment.start);
    const highest = !next
      ? duration
      : isShared && side === "end"
        ? next.end_ms / 1000
        : Math.max(next.start_ms / 1000, segment.end);
    return {
      lowest,
      highest,
      snapTimes: this.snapTargets(index),
      snapDistance: SNAP_PX / this.wrapperPxPerSec(),
    };
  }

  /** The times an edge Snaps to: where the media is, and each edge of the Segments but the one at `index`. */
  private snapTargets(index: number): number[] {
    return [
      this.mediaTarget.currentTime,
      ...this.segments
        .filter((_, other) => other !== index)
        .flatMap((other) => [other.start_ms / 1000, other.end_ms / 1000]),
    ];
  }

  /** How many pixels the waveform draws a second, as the regions measure it while dragged. */
  private wrapperPxPerSec(): number {
    const width = this.surfer?.getWrapper().getBoundingClientRect().width ?? 0;
    const duration = this.surfer?.getDuration() ?? 0;
    return width > 0 && duration > 0 ? width / duration : this.pxPerSec;
  }

  /** Keeps a range just drawn to the gap it began in, Snapped at both ends, or drops it where no gap is. */
  private keepRange(range: Region): void {
    this.dropRange();
    const next = this.segments.findIndex(
      (segment) => segment.start_ms / 1000 > range.start,
    );
    const nextIndex = next === -1 ? this.segments.length : next;
    const previous = this.segments[nextIndex - 1];
    const lowest = previous ? previous.end_ms / 1000 : 0;
    const highest =
      nextIndex < this.segments.length
        ? this.segments[nextIndex].start_ms / 1000
        : (this.surfer?.getDuration() ?? range.end);
    const snapTimes = this.snapTargets(-1);
    const snapDistance = SNAP_PX / this.wrapperPxPerSec();
    const snap = (time: number) =>
      this.isSnapping !== this.modifiers.shiftKey
        ? snapTime(time, snapTimes, snapDistance)
        : time;
    const start = Math.max(lowest, snap(range.start));
    const end = Math.min(highest, snap(range.end));
    if (this.isHeld || end <= start) {
      range.remove();
      return;
    }
    range.setOptions({ start, end });
    this.range = range;
    this.showTimes(range);
  }

  private dropRange(): void {
    this.range?.remove();
    this.range = null;
    this.showTimes(null);
  }

  /**
   * Shows the times of `span` and how long it runs, as Subtitle Edit shows a drawn range's length,
   * or none; while the pointer drags it, the time under the pointer gives way, since the times it
   * lands on may be Snapped away from it.
   */
  private showTimes(span: Span | null, isDragging = false): void {
    this.timesTarget.hidden = span === null;
    this.timesTarget.textContent = span
      ? `${formatSeconds(span.start)} → ${formatSeconds(span.end)} (${formatLength(span)})`
      : "";
    this.waveformTarget.toggleAttribute("data-is-dragging", isDragging);
  }

  /** Asks the Project for new times for the Segment at `index`, unless they are the ones it has. */
  private async retime(index: number, span: Span): Promise<void> {
    const segment = this.segments[index];
    const start_ms = toMilliseconds(span.start);
    const end_ms = toMilliseconds(span.end);
    if (segment.start_ms === start_ms && segment.end_ms === end_ms) return;
    await this.change({ kind: "times", index, start_ms, end_ms });
  }

  /** Makes `change`, putting the regions back where the Segments are when it is refused. */
  private async change(change: SegmentChange): Promise<void> {
    const outcome = await this.session.change(change);
    if (outcome.kind === "failed") this.markSegments();
    notifyEdit(outcome);
  }

  private showSnapping(): void {
    this.snappingTarget.setAttribute("aria-pressed", `${this.isSnapping}`);
    this.snappingTarget.classList.toggle("btn-active", this.isSnapping);
  }

  private showZoomLevel(): void {
    const percent = Math.round((this.pxPerSec / INITIAL_PX_PER_SEC) * 100);
    this.zoomLevelTarget.textContent = `${percent}%`;
  }

  private zoomTo(pxPerSec: number): void {
    this.pxPerSec = Math.min(
      MAX_PX_PER_SEC,
      Math.max(MIN_PX_PER_SEC, pxPerSec),
    );
    this.surfer?.zoom(this.pxPerSec);
    this.showZoomLevel();
  }

  /** A theme colour resolved to a value the canvas can paint, since a canvas cannot read CSS variables. */
  private themeColor(variable: string, fallback: string): string {
    const value = getComputedStyle(this.element).getPropertyValue(variable);
    return value.trim() || fallback;
  }
}

function spanOf(segment: Segment): Span {
  return { start: segment.start_ms / 1000, end: segment.end_ms / 1000 };
}
