import { Controller } from "@hotwired/stimulus";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  followProject,
  type ProjectView,
  type Segment,
  type UnlistenFn,
} from "../backend/project";
import { formatClock, formatTime } from "../ui/time";

/** The Preview: the Current Resource's media, played whole, with the Segment being played over it. */
/** Where the webview remembers the Preview folded away, a choice of this machine's alone. */
const FOLDED_KEY = "tsuzuri.preview-folded";

function readFolded(): boolean {
  try {
    return localStorage.getItem(FOLDED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeFolded(isFolded: boolean): void {
  try {
    localStorage.setItem(FOLDED_KEY, String(isFolded));
  } catch {
    // A webview without storage forgets the choice when it closes.
  }
}

export default class PreviewController extends Controller {
  static targets = [
    "panel",
    "fold",
    "foldIcon",
    "screen",
    "media",
    "caption",
    "hint",
    "playback",
    "time",
    "currentEmpty",
    "current",
    "currentNumber",
    "currentTimes",
    "currentText",
    "currentTranslation",
  ];

  declare readonly panelTarget: HTMLElement;
  /** Hides or shows the panel; only a Resource with media has one to fold. */
  declare readonly foldTarget: HTMLButtonElement;
  declare readonly foldIconTarget: HTMLElement;
  declare readonly screenTarget: HTMLElement;
  declare readonly mediaTarget: HTMLVideoElement;
  declare readonly captionTarget: HTMLElement;
  declare readonly hintTarget: HTMLElement;
  declare readonly playbackTarget: HTMLElement;
  declare readonly timeTarget: HTMLElement;
  /** Asks for a Segment to be clicked while none is current. */
  declare readonly currentEmptyTarget: HTMLElement;
  /** The Current Segment beside the video: its number, times and text. */
  declare readonly currentTarget: HTMLElement;
  declare readonly currentNumberTarget: HTMLElement;
  declare readonly currentTimesTarget: HTMLElement;
  declare readonly currentTextTarget: HTMLElement;
  declare readonly currentTranslationTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private playingIndex: number | null = null;
  private currentIndex: number | null = null;
  private isFolded = readFolded();
  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
  }

  showCurrent({ detail }: CustomEvent<{ index: number }>): void {
    this.currentIndex = detail.index;
    this.showCurrentSegment();
  }

  toggleFold(): void {
    this.isFolded = !this.isFolded;
    writeFolded(this.isFolded);
    this.showPanel();
  }

  togglePlayback(): void {
    if (this.mediaTarget.paused) void this.mediaTarget.play();
    else this.mediaTarget.pause();
  }

  /** Leaves the video out for media without a picture, keeping only the controls. */
  measure(): void {
    this.screenTarget.hidden = this.mediaTarget.videoWidth === 0;
    this.showTime();
  }

  showTime(): void {
    const { currentTime, duration } = this.mediaTarget;
    const length = Number.isFinite(duration) ? duration : 0;
    this.timeTarget.textContent = `${formatClock(currentTime * 1000)} / ${formatClock(length * 1000)}`;
  }

  follow(): void {
    this.showTime();
    const at = this.mediaTarget.currentTime * 1000;
    const index = this.segments.findIndex(
      (segment) => segment.start_ms <= at && at < segment.end_ms,
    );
    this.captionTarget.textContent = this.segments[index]?.text ?? "";
    this.markPlaying(index === -1 ? null : index);
  }

  showPlaying(): void {
    this.playbackTarget.classList.add("swap-active");
  }

  showPaused(): void {
    this.playbackTarget.classList.remove("swap-active");
  }

  showUnplayable(): void {
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = true;
    this.hintTarget.hidden = false;
  }

  private showCurrentSegment(): void {
    const segment =
      this.currentIndex === null ? undefined : this.segments[this.currentIndex];
    this.currentEmptyTarget.hidden = segment !== undefined;
    this.currentTarget.hidden = segment === undefined;
    if (!segment) return;
    this.currentNumberTarget.textContent = `#${this.currentIndex! + 1}`;
    this.currentTimesTarget.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
    this.currentTextTarget.textContent = segment.text;
    this.currentTranslationTarget.textContent = segment.translation ?? "";
  }

  private showPanel(): void {
    const hasMedia = this.media !== null;
    this.foldTarget.hidden = !hasMedia;
    this.panelTarget.hidden = !hasMedia || this.isFolded;
    this.foldIconTarget.classList.toggle("swap-active", this.isFolded);
    this.foldTarget.setAttribute("aria-pressed", String(this.isFolded));
  }

  /** Tells the editor which Segment is being played, each time that changes. */
  private markPlaying(index: number | null): void {
    if (index === this.playingIndex) return;
    this.playingIndex = index;
    this.dispatch("playing", { detail: { index } });
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
    const media = project?.media ?? null;
    if (media !== this.media) this.currentIndex = null;
    this.showCurrentSegment();
    if (media === this.media) return;
    this.media = media;
    this.showPanel();
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = false;
    this.hintTarget.hidden = true;
    this.captionTarget.textContent = "";
    this.markPlaying(null);
    if (media === null) this.mediaTarget.removeAttribute("src");
    else this.mediaTarget.src = convertFileSrc(media);
  }
}
