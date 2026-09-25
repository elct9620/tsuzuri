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
const ZOOM_FACTOR = 2;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 1600;

const REGION_COLORS = [
  "color-mix(in oklab, var(--color-primary) 22%, transparent)",
  "color-mix(in oklab, var(--color-secondary) 22%, transparent)",
];

/** The colour of the Segment at `index`: neighbours take turns, so where one ends and the next begins shows. */
export function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length];
}

/** The Preview's timeline: the Waveform of the Current Resource's media with a region for each Segment. */
export default class TimelineController extends Controller {
  static targets = ["media", "waveform"];

  declare readonly mediaTarget: HTMLMediaElement;
  declare readonly waveformTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private pxPerSec = INITIAL_PX_PER_SEC;
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

  scroll(event: WheelEvent): void {
    this.surfer?.setScroll(this.surfer.getScroll() + event.deltaY);
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
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
    this.regions = RegionsPlugin.create();
    this.surfer = WaveSurfer.create({
      container: this.waveformTarget,
      media: this.mediaTarget,
      peaks: [waveform.peaks],
      duration: waveform.peaks.length / waveform.peaks_per_second,
      height: 56,
      minPxPerSec: this.pxPerSec,
      waveColor: this.themeColor("--color-base-content", "#888"),
      progressColor: this.themeColor("--color-primary", "#555"),
      cursorColor: this.themeColor("--color-primary", "#555"),
      plugins: [this.regions, TimelinePlugin.create({ height: 20 })],
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
        color: regionColor(index),
        drag: false,
        resize: false,
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
