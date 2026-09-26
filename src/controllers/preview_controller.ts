import { Controller } from "@hotwired/stimulus";
import { convertFileSrc } from "@tauri-apps/api/core";

import type {
  ProjectFeed,
  ProjectOptions,
  ProjectView,
  Segment,
} from "../backend/project";
import type { EditingSession } from "../editor";
import { rememberChoice, rememberedChoice } from "../ui/choices";
import { formatClock, formatTime } from "../ui/time";

/** Where the webview remembers the Preview folded away. */
const FOLDED_KEY = "tsuzuri.preview-folded";

/** Which text of the Segment being played is shown over the video. */
type CaptionLanguage = "original" | "translation" | "bilingual";

/** Where the webview remembers what is shown over the video. */
const CAPTION_KEY = "tsuzuri.preview-caption";

function captionLanguageOf(value: string | null): CaptionLanguage {
  return value === "translation" || value === "bilingual" ? value : "original";
}

/** What the text over the video sits on: a shadow alone, a translucent black or an opaque one. */
type CaptionBackdrop = "none" | "translucent" | "opaque";

/** Where the webview remembers the backdrop over the video. */
const BACKDROP_KEY = "tsuzuri.preview-backdrop";

/** A shadow alone is lost on a bright picture, so a caption sits on a backdrop until taken away. */
function captionBackdropOf(value: string | null): CaptionBackdrop {
  return value === "none" || value === "opaque" ? value : "translucent";
}

/** Puts `text` in `element` only when it changes, since the Preview follows the media each frame it plays. */
function showText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/** The Preview: the Current Resource's media, played whole, with the Segment being played over it. */
export default class PreviewController extends Controller {
  static targets = [
    "panel",
    "foldButton",
    "foldIcon",
    "screen",
    "media",
    "caption",
    "captionChoice",
    "captionLanguage",
    "captionBackdrop",
    "hint",
    "playbackIcon",
    "time",
    "currentHint",
    "currentCard",
    "currentNumber",
    "currentTimes",
    "currentText",
    "currentTranslation",
  ];

  declare readonly feed: ProjectFeed;
  declare readonly session: EditingSession;
  declare readonly panelTarget: HTMLElement;
  /** Hides or shows the panel; only a Resource with media has one to fold. */
  declare readonly foldButtonTarget: HTMLButtonElement;
  declare readonly foldIconTarget: HTMLElement;
  declare readonly screenTarget: HTMLElement;
  declare readonly mediaTarget: HTMLVideoElement;
  declare readonly captionTarget: HTMLElement;
  /** Chooses what is shown over the video and what it sits on; only a picture has one. */
  declare readonly captionChoiceTarget: HTMLElement;
  declare readonly captionLanguageTargets: HTMLInputElement[];
  declare readonly captionBackdropTargets: HTMLInputElement[];
  declare readonly hintTarget: HTMLElement;
  declare readonly playbackIconTarget: HTMLElement;
  declare readonly timeTarget: HTMLElement;
  /** Asks for a Segment to be clicked while none is current. */
  declare readonly currentHintTarget: HTMLElement;
  /** The Current Segment beside the video: its number, times and text. */
  declare readonly currentCardTarget: HTMLElement;
  declare readonly currentNumberTarget: HTMLElement;
  declare readonly currentTimesTarget: HTMLElement;
  declare readonly currentTextTarget: HTMLElement;
  declare readonly currentTranslationTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private playingIndex: number | null = null;
  private hasTranslation = false;
  private bilingualOrder: ProjectOptions["bilingual_order"] = "original-first";
  private captionLanguage = captionLanguageOf(rememberedChoice(CAPTION_KEY));
  private captionBackdrop = captionBackdropOf(rememberedChoice(BACKDROP_KEY));
  private isFolded = rememberedChoice(FOLDED_KEY) === "true";
  private unfollow?: () => void;
  /** The request for the next frame the Preview follows the media on, while it plays. */
  private frameRequest: number | null = null;

  connect(): void {
    this.showCaptionBackdrop();
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
    this.stopFollowingFrames();
  }

  /** Shows the Current Segment in the card beside the video. */
  showCursor(): void {
    this.showCurrentSegment();
  }

  toggleFold(): void {
    this.isFolded = !this.isFolded;
    rememberChoice(FOLDED_KEY, String(this.isFolded));
    this.showPanel();
  }

  chooseCaptionLanguage({ target }: Event): void {
    this.captionLanguage = (target as HTMLInputElement)
      .value as CaptionLanguage;
    rememberChoice(CAPTION_KEY, this.captionLanguage);
    this.showCaption(this.segmentIndexAtTime());
  }

  chooseCaptionBackdrop({ target }: Event): void {
    this.captionBackdrop = (target as HTMLInputElement)
      .value as CaptionBackdrop;
    rememberChoice(BACKDROP_KEY, this.captionBackdrop);
    this.showCaptionBackdrop();
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
    showText(
      this.timeTarget,
      `${formatClock(currentTime * 1000)} / ${formatClock(length * 1000)}`,
    );
  }

  follow(): void {
    this.showTime();
    const index = this.segmentIndexAtTime();
    this.showCaption(index);
    const isPlaying = !this.mediaTarget.paused && index !== -1;
    this.markPlaying(isPlaying ? index : null);
  }

  showPlaying(): void {
    this.playbackIconTarget.classList.add("swap-active");
    this.followFrames();
  }

  showPaused(): void {
    this.playbackIconTarget.classList.remove("swap-active");
    this.stopFollowingFrames();
    this.markPlaying(null);
  }

  showUnplayable(): void {
    this.screenTarget.hidden = false;
    this.mediaTarget.hidden = true;
    this.hintTarget.hidden = false;
    this.captionChoiceTarget.hidden = true;
  }

  /**
   * A player reports its time only a few times a second, so while it plays the Preview follows
   * each frame drawn, and a caption comes with its words.
   */
  private followFrames(): void {
    if (this.frameRequest !== null) return;
    const onFrame = () => {
      this.follow();
      this.frameRequest = this.mediaTarget.paused
        ? null
        : requestAnimationFrame(onFrame);
    };
    this.frameRequest = requestAnimationFrame(onFrame);
  }

  private stopFollowingFrames(): void {
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
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
    showText(this.captionTarget, segment ? this.caption(segment) : "");
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

  private showCaptionBackdrop(): void {
    this.captionTarget.dataset.backdrop = this.captionBackdrop;
    for (const input of this.captionBackdropTargets) {
      input.checked = input.value === this.captionBackdrop;
    }
  }

  private showCurrentSegment(): void {
    const index = this.session.cursor.index;
    const segment = index === null ? undefined : this.segments[index];
    this.currentHintTarget.hidden = segment !== undefined;
    this.currentCardTarget.hidden = segment === undefined;
    if (!segment) return;
    this.currentNumberTarget.textContent = `#${index! + 1}`;
    this.currentTimesTarget.textContent = `${formatTime(segment.start_ms)} → ${formatTime(segment.end_ms)}`;
    this.currentTextTarget.textContent = segment.text;
    this.currentTranslationTarget.textContent = segment.translation ?? "";
  }

  private showPanel(): void {
    const hasMedia = this.media !== null;
    this.foldButtonTarget.hidden = !hasMedia;
    this.panelTarget.hidden = !hasMedia || this.isFolded;
    this.foldIconTarget.classList.toggle("swap-active", this.isFolded);
    this.foldButtonTarget.setAttribute("aria-pressed", String(this.isFolded));
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
