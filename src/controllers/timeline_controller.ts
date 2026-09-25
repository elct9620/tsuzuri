import { Controller } from "@hotwired/stimulus";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import TimelinePlugin from "wavesurfer.js/plugins/timeline";

import {
  followProject,
  type ProjectView,
  type Segment,
  type UnlistenFn,
} from "../backend/project";
import { extractWaveform, type Waveform } from "../backend/waveform";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

const INITIAL_PX_PER_SEC = 100;
/** The time scale's height, which the page leaves free beneath the waveform. */
const TIMELINE_HEIGHT = 20;
const ZOOM_FACTOR = 2;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 1600;
/** How far the wheel turns to zoom by a factor of e; a pinch reports small steps, a mouse wheel about 100. */
const WHEEL_ZOOM_SCALE = 200;

const REGION_COLORS = ["--segment-even", "--segment-odd"];

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

/** The Preview's timeline: the Waveform of the Current Resource's media with a region for each Segment. */
export default class TimelineController extends Controller {
  static targets = ["media", "waveform"];

  declare readonly mediaTarget: HTMLMediaElement;
  declare readonly waveformTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private pxPerSec = INITIAL_PX_PER_SEC;
  private currentIndex: number | null = null;
  private surfer?: WaveSurfer;
  private regions?: ReturnType<typeof RegionsPlugin.create>;
  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
    this.surfer?.destroy();
  }

  zoomIn(): void {
    this.zoomTo(this.pxPerSec * ZOOM_FACTOR);
  }

  zoomOut(): void {
    this.zoomTo(this.pxPerSec / ZOOM_FACTOR);
  }

  /** Stops the media when it plays, or else plays the Current Segment alone. */
  playCurrent(): void {
    if (!this.mediaTarget.paused) {
      this.mediaTarget.pause();
      return;
    }
    const segment =
      this.currentIndex === null ? undefined : this.segments[this.currentIndex];
    if (segment)
      void this.surfer?.play(segment.start_ms / 1000, segment.end_ms / 1000);
  }

  showCurrent({ detail }: CustomEvent<{ index: number }>): void {
    this.currentIndex = detail.index;
    this.colorRegions();
  }

  /** Scrolls the timeline, or zooms it while ⌘ or Ctrl is held, as a trackpad pinch also reports. */
  scrollOrZoom(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      this.zoomTo(this.pxPerSec * Math.exp(-event.deltaY / WHEEL_ZOOM_SCALE));
      return;
    }
    this.surfer?.setScroll(
      this.surfer.getScroll() + event.deltaX + event.deltaY,
    );
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
    const media = project?.media ?? null;
    if (media === this.media) {
      this.markSegments();
      return;
    }
    this.media = media;
    this.currentIndex = null;
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
    this.regions = RegionsPlugin.create();
    this.regions.on("region-clicked", (region) =>
      this.makeCurrent(this.regions!.getRegions().indexOf(region)),
    );
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
        this.regions,
        TimelinePlugin.create({ height: TIMELINE_HEIGHT }),
      ],
    });
    this.surfer.on("ready", () => this.markSegments());
  }

  private markSegments(): void {
    if (!this.regions) return;
    this.regions.clearRegions();
    this.segments.forEach((segment, index) =>
      this.regions!.addRegion({
        start: segment.start_ms / 1000,
        end: segment.end_ms / 1000,
        color: regionColor(index, index === this.currentIndex),
        drag: false,
        resize: false,
      }),
    );
  }

  private makeCurrent(index: number): void {
    this.currentIndex = index;
    this.colorRegions();
    this.dispatch("current", { detail: { index } });
  }

  private colorRegions(): void {
    this.regions?.getRegions().forEach((region, index) =>
      region.setOptions({
        color: regionColor(index, index === this.currentIndex),
      }),
    );
  }

  private zoomTo(pxPerSec: number): void {
    this.pxPerSec = Math.min(
      MAX_PX_PER_SEC,
      Math.max(MIN_PX_PER_SEC, pxPerSec),
    );
    this.surfer?.zoom(this.pxPerSec);
  }

  /** A theme colour resolved to a value the canvas can paint, since a canvas cannot read CSS variables. */
  private themeColor(variable: string, fallback: string): string {
    const value = getComputedStyle(this.element).getPropertyValue(variable);
    return value.trim() || fallback;
  }
}
