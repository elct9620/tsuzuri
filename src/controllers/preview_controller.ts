import { Controller } from "@hotwired/stimulus";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  followProject,
  type ProjectView,
  type Segment,
  type UnlistenFn,
} from "../backend/project";
import { formatClock } from "../ui/time";

/** The Preview: the Current Resource's media, played whole, with the Segment being played over it. */
export default class PreviewController extends Controller<HTMLElement> {
  static targets = ["screen", "media", "caption", "hint", "playback", "time"];

  declare readonly screenTarget: HTMLElement;
  declare readonly mediaTarget: HTMLVideoElement;
  declare readonly captionTarget: HTMLElement;
  declare readonly hintTarget: HTMLElement;
  declare readonly playbackTarget: HTMLElement;
  declare readonly timeTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private playingIndex: number | null = null;
  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await followProject((project) => this.show(project));
  }

  disconnect(): void {
    this.unlisten?.();
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

  /** Tells the editor which Segment is being played, each time that changes. */
  private markPlaying(index: number | null): void {
    if (index === this.playingIndex) return;
    this.playingIndex = index;
    this.dispatch("playing", { detail: { index } });
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
    const media = project?.media ?? null;
    if (media === this.media) return;
    this.media = media;
    this.element.hidden = media === null;
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = false;
    this.hintTarget.hidden = true;
    this.captionTarget.textContent = "";
    this.markPlaying(null);
    if (media === null) this.mediaTarget.removeAttribute("src");
    else this.mediaTarget.src = convertFileSrc(media);
  }
}
