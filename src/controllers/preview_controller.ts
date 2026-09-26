import { Controller } from "@hotwired/stimulus";
import { convertFileSrc } from "@tauri-apps/api/core";

import type {
  ProjectFeed,
  ProjectOptions,
  ProjectView,
  Segment,
} from "../backend/project";
import type { EditingSession } from "../editor";
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

/** Which text of the Segment being played is shown over the video. */
type CaptionLanguage = "original" | "translation" | "bilingual";

/** Where the webview remembers what is shown over the video, a choice of this machine's alone. */
const CAPTION_KEY = "tsuzuri.preview-caption";

function readCaptionLanguage(): CaptionLanguage {
  try {
    const value = localStorage.getItem(CAPTION_KEY);
    return value === "translation" || value === "bilingual"
      ? value
      : "original";
  } catch {
    return "original";
  }
}

function writeCaptionLanguage(language: CaptionLanguage): void {
  try {
    localStorage.setItem(CAPTION_KEY, language);
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
    "captionChoice",
    "captionLanguage",
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

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;
  declare readonly panelTarget: HTMLElement;
  /** Hides or shows the panel; only a Resource with media has one to fold. */
  declare readonly foldTarget: HTMLButtonElement;
  declare readonly foldIconTarget: HTMLElement;
  declare readonly screenTarget: HTMLElement;
  declare readonly mediaTarget: HTMLVideoElement;
  declare readonly captionTarget: HTMLElement;
  /** Chooses the original, the translation shown or both over the video; only a picture has one. */
  declare readonly captionChoiceTarget: HTMLElement;
  declare readonly captionLanguageTargets: HTMLInputElement[];
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
  private hasTranslation = false;
  private bilingualOrder: ProjectOptions["bilingual_order"] = "original-first";
  private captionLanguage = readCaptionLanguage();
  private isFolded = readFolded();
  private unfollow?: () => void;

  connect(): void {
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
  }

  /** Shows the Current Segment in the card beside the video. */
  showCursor(): void {
    this.showCurrentSegment();
  }

  toggleFold(): void {
    this.isFolded = !this.isFolded;
    writeFolded(this.isFolded);
    this.showPanel();
  }

  chooseCaptionLanguage({ target }: Event): void {
    this.captionLanguage = (target as HTMLInputElement)
      .value as CaptionLanguage;
    writeCaptionLanguage(this.captionLanguage);
    this.showCaption(this.segmentIndexAtTime());
  }

  togglePlayback(): void {
    if (this.mediaTarget.paused) void this.mediaTarget.play();
    else this.mediaTarget.pause();
  }

  /** Leaves the video out for media without a picture, keeping only the controls. */
  measure(): void {
    this.screenTarget.hidden = this.mediaTarget.videoWidth === 0;
    this.captionChoiceTarget.hidden = this.screenTarget.hidden;
    this.showTime();
  }

  showTime(): void {
    const { currentTime, duration } = this.mediaTarget;
    const length = Number.isFinite(duration) ? duration : 0;
    this.timeTarget.textContent = `${formatClock(currentTime * 1000)} / ${formatClock(length * 1000)}`;
  }

  follow(): void {
    this.showTime();
    const index = this.segmentIndexAtTime();
    this.showCaption(index);
    const isPlaying = !this.mediaTarget.paused && index !== -1;
    this.markPlaying(isPlaying ? index : null);
  }

  showPlaying(): void {
    this.playbackTarget.classList.add("swap-active");
  }

  showPaused(): void {
    this.playbackTarget.classList.remove("swap-active");
    this.markPlaying(null);
  }

  showUnplayable(): void {
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = true;
    this.hintTarget.hidden = false;
    this.captionChoiceTarget.hidden = true;
  }

  /** The index of the Segment at the media's time, or -1 between Segments. */
  private segmentIndexAtTime(): number {
    const at = this.mediaTarget.currentTime * 1000;
    return this.segments.findIndex(
      (segment) => segment.start_ms <= at && at < segment.end_ms,
    );
  }

  private showCaption(index: number): void {
    const segment = this.segments[index];
    this.captionTarget.textContent = segment ? this.caption(segment) : "";
  }

  /** The text over the video, laid out as a Bilingual SRT cue lays out both languages. */
  private caption({ text, translation }: Segment): string {
    const language = this.hasTranslation ? this.captionLanguage : "original";
    if (language === "translation") return translation ?? "";
    if (language === "original" || !translation) return text;
    return this.bilingualOrder === "translation-first"
      ? `${translation}\n${text}`
      : `${text}\n${translation}`;
  }

  /** Offers the translation only while one is shown, keeping the choice for when one is again. */
  private showCaptionChoice(): void {
    const language = this.hasTranslation ? this.captionLanguage : "original";
    for (const input of this.captionLanguageTargets) {
      input.disabled = !this.hasTranslation && input.value !== "original";
      input.checked = input.value === language;
    }
  }

  private showCurrentSegment(): void {
    const index = this.session.cursor.index;
    const segment = index === null ? undefined : this.segments[index];
    this.currentEmptyTarget.hidden = segment !== undefined;
    this.currentTarget.hidden = segment === undefined;
    if (!segment) return;
    this.currentNumberTarget.textContent = `#${index! + 1}`;
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
    this.hasTranslation = (project?.shown_translation ?? null) !== null;
    this.bilingualOrder = project?.options.bilingual_order ?? "original-first";
    this.showCaptionChoice();
    const media = project?.media ?? null;
    this.showCurrentSegment();
    if (media === this.media) {
      this.showCaption(this.segmentIndexAtTime());
      return;
    }
    this.media = media;
    this.showPanel();
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = false;
    this.hintTarget.hidden = true;
    this.captionChoiceTarget.hidden = false;
    this.captionTarget.textContent = "";
    this.markPlaying(null);
    if (media === null) this.mediaTarget.removeAttribute("src");
    else this.mediaTarget.src = convertFileSrc(media);
  }
}
