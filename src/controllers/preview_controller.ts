import { Controller } from "@hotwired/stimulus";
import { convertFileSrc } from "@tauri-apps/api/core";

import type {
  ProjectFeed,
  ProjectOptions,
  ProjectView,
  Segment,
} from "../backend/project";
import {
  destroyVideoWindow,
  leaveVideoWindowFullscreen,
  toggleVideoWindowFullscreen,
} from "../backend/video_window";
import type { EditingSession } from "../editor";
import { t } from "../i18n";
import { rememberChoice, rememberedChoice } from "../ui/choices";
import { formatClock, formatTime } from "../ui/time";
import { forwardKeys, openVideoWindow } from "../ui/video_window";

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

/** Where the webview remembers the Speaker over the video turned off. */
const SPEAKER_KEY = "tsuzuri.preview-speaker";

/** `text` after a Speaker Label naming `name`, as a cue names its Speaker; with nothing to say, no one is named. */
function withSpeakerLabel(text: string, name: string | undefined): string {
  return name && text ? `${name}: ${text}` : text;
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
    "captionSpeaker",
    "hint",
    "videoWindowButton",
    "playbackIcon",
    "time",
    "currentSection",
    "currentHint",
    "currentCard",
    "currentNumber",
    "currentTimes",
    "currentSpeaker",
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
  declare readonly captionSpeakerTarget: HTMLInputElement;
  declare readonly hintTarget: HTMLElement;
  /** Moves the video into the Video Window and back; only a picture has one to move. */
  declare readonly videoWindowButtonTarget: HTMLButtonElement;
  declare readonly playbackIconTarget: HTMLElement;
  declare readonly timeTarget: HTMLElement;
  /** What the card shows of the Current Segment, put away while the video is out of the Preview. */
  declare readonly currentSectionTarget: HTMLElement;
  /** Asks for a Segment to be clicked while none is current. */
  declare readonly currentHintTarget: HTMLElement;
  /** The Current Segment beside the video: its number, times and text. */
  declare readonly currentCardTarget: HTMLElement;
  declare readonly currentNumberTarget: HTMLElement;
  declare readonly currentTimesTarget: HTMLElement;
  /** Who says the Current Segment, left out while no one is named. */
  declare readonly currentSpeakerTarget: HTMLElement;
  declare readonly currentTextTarget: HTMLElement;
  declare readonly currentTranslationTarget: HTMLElement;

  private media: string | null = null;
  private segments: Segment[] = [];
  private playingIndexes: number[] = [];
  private hasTranslation = false;
  private speakerNames: ProjectView["shown_speaker_names"] = {};
  private bilingualOrder: ProjectOptions["bilingual_order"] = "original-first";
  private captionLanguage = captionLanguageOf(rememberedChoice(CAPTION_KEY));
  private captionBackdrop = captionBackdropOf(rememberedChoice(BACKDROP_KEY));
  /** A saved cue names its Speaker, so the caption does too until turned off. */
  private isSpeakerShown = rememberedChoice(SPEAKER_KEY) !== "false";
  private isFolded = rememberedChoice(FOLDED_KEY) === "true";
  private unfollow?: () => void;
  /** The request for the next frame the Preview follows the media on while it plays, and the window drawing it. */
  private frameRequest: { view: Window; id: number } | null = null;
  /**
   * The player and what is drawn over it, kept from `connect`: the Video Window takes them out of
   * the controller's element, where Stimulus no longer finds them as targets or binds their actions.
   */
  private screen!: HTMLElement;
  /** The row the video sits in beside the card, and comes back to. */
  private screenRow!: HTMLElement;
  private player!: HTMLVideoElement;
  private captionBox!: HTMLElement;
  private unplayableHint!: HTMLElement;
  /** The window the video is in while it is out of the Preview. */
  private videoWindow: Window | null = null;
  private readonly playerListeners: [string, () => void][] = [
    ["loadedmetadata", () => this.measure()],
    ["durationchange", () => this.showTime()],
    ["timeupdate", () => this.follow()],
    ["play", () => this.showPlaying()],
    ["pause", () => this.showPaused()],
    ["error", () => this.showUnplayable()],
  ];

  connect(): void {
    this.screen = this.screenTarget;
    this.screenRow = this.screen.parentElement!;
    this.player = this.mediaTarget;
    this.captionBox = this.captionTarget;
    this.unplayableHint = this.hintTarget;
    for (const [name, listener] of this.playerListeners)
      this.player.addEventListener(name, listener);
    this.showCaptionBackdrop();
    this.captionSpeakerTarget.checked = this.isSpeakerShown;
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
    this.stopFollowingFrames();
    if (this.videoWindow) this.closeVideoWindow();
    for (const [name, listener] of this.playerListeners)
      this.player.removeEventListener(name, listener);
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
    this.showCaption(this.segmentIndexesAtTime());
  }

  chooseCaptionBackdrop({ target }: Event): void {
    this.captionBackdrop = (target as HTMLInputElement)
      .value as CaptionBackdrop;
    rememberChoice(BACKDROP_KEY, this.captionBackdrop);
    this.showCaptionBackdrop();
  }

  toggleCaptionSpeaker(): void {
    this.isSpeakerShown = this.captionSpeakerTarget.checked;
    rememberChoice(SPEAKER_KEY, String(this.isSpeakerShown));
    this.showCaption(this.segmentIndexesAtTime());
  }

  toggleVideoWindow(): void {
    if (this.videoWindow) this.closeVideoWindow();
    else this.moveVideoOut();
  }

  /**
   * Brings the video back as the Video Window is closed. With none of this page's open, as after the
   * page is reloaded, the window it left behind goes all the same.
   */
  closeVideoWindow(): void {
    this.bringVideoBack();
    void destroyVideoWindow();
  }

  togglePlayback(): void {
    if (this.player.paused) void this.player.play();
    else this.player.pause();
  }

  /** Leaves the video out for media without a picture, keeping only the controls. */
  measure(): void {
    const hasPicture = this.player.videoWidth > 0;
    if (!hasPicture && this.videoWindow) this.closeVideoWindow();
    this.screen.hidden = !hasPicture;
    this.captionChoiceTarget.hidden = !hasPicture;
    this.videoWindowButtonTarget.hidden = !hasPicture;
    this.showTime();
  }

  showTime(): void {
    const { currentTime, duration } = this.player;
    const length = Number.isFinite(duration) ? duration : 0;
    showText(
      this.timeTarget,
      `${formatClock(currentTime * 1000)} / ${formatClock(length * 1000)}`,
    );
  }

  follow(): void {
    this.showTime();
    const indexes = this.segmentIndexesAtTime();
    this.showCaption(indexes);
    this.markPlaying(this.player.paused ? [] : indexes);
  }

  showPlaying(): void {
    this.playbackIconTarget.classList.add("swap-active");
    this.followFrames();
  }

  showPaused(): void {
    this.playbackIconTarget.classList.remove("swap-active");
    this.stopFollowingFrames();
    this.markPlaying([]);
  }

  showUnplayable(): void {
    this.screen.hidden = false;
    this.player.hidden = true;
    this.unplayableHint.hidden = false;
    this.captionChoiceTarget.hidden = true;
  }

  /**
   * A player reports its time only a few times a second, so while it plays the Preview follows
   * each frame drawn, and a caption comes with its words. The frames are those of the window the
   * video is in, which keeps drawing while the main window is behind another.
   */
  private followFrames(): void {
    if (this.frameRequest !== null) return;
    const view = this.player.ownerDocument.defaultView ?? window;
    const onFrame = () => {
      this.frameRequest = null;
      this.follow();
      if (!this.player.paused) this.followFrames();
    };
    this.frameRequest = { view, id: view.requestAnimationFrame(onFrame) };
  }

  private stopFollowingFrames(): void {
    this.frameRequest?.view.cancelAnimationFrame(this.frameRequest.id);
    this.frameRequest = null;
  }

  private moveVideoOut(): void {
    const videoWindow = openVideoWindow(t("preview.videoWindowTitle"));
    if (!videoWindow) return;
    forwardKeys(videoWindow);
    videoWindow.addEventListener("keydown", ({ key }) => {
      if (key === "Escape") void leaveVideoWindowFullscreen();
    });
    videoWindow.addEventListener(
      "dblclick",
      () => void toggleVideoWindowFullscreen(),
    );
    this.videoWindow = videoWindow;
    this.moveScreen(() => videoWindow.document.body.append(this.screen));
  }

  private bringVideoBack(): void {
    if (!this.videoWindow) return;
    this.videoWindow = null;
    this.moveScreen(() => this.screenRow.prepend(this.screen));
  }

  /**
   * Moves the player with what is drawn over it between the Preview and the Video Window. WebKit
   * pauses a media element moved to another page, keeping its time, so a playing one plays on, and
   * its frames are followed in the window it is now in.
   */
  private moveScreen(place: () => void): void {
    const { paused } = this.player;
    this.stopFollowingFrames();
    place();
    this.screen.toggleAttribute("data-is-away", this.videoWindow !== null);
    if (!paused && this.player.paused) void this.player.play();
    if (!this.player.paused) this.followFrames();
    this.showVideoWindow();
  }

  /**
   * Once the video is out, the card's Current Segment repeats the row being edited, so only the
   * controls stay above the timeline and the editor takes the height.
   */
  private showVideoWindow(): void {
    const isAway = this.videoWindow !== null;
    this.screenRow.toggleAttribute("data-is-video-away", isAway);
    this.currentSectionTarget.hidden = isAway;
    this.videoWindowButtonTarget.setAttribute("aria-pressed", `${isAway}`);
    this.videoWindowButtonTarget.classList.toggle("btn-primary", isAway);
  }

  /** The indexes of the Segments at the media's time, in the order they start; none between Segments. */
  private segmentIndexesAtTime(): number[] {
    const at = this.player.currentTime * 1000;
    return this.segments.flatMap((segment, index) =>
      segment.start_ms <= at && at < segment.end_ms ? [index] : [],
    );
  }

  /** Shows the Segments at `indexes` over the video, each above those that started before it. */
  private showCaption(indexes: number[]): void {
    const captions = indexes.map((index) => this.caption(this.segments[index]));
    showText(this.captionBox, captions.reverse().join("\n"));
  }

  /**
   * The text over the video, laid out as a Bilingual SRT cue lays out both languages, each
   * naming the Speaker as that language's subtitle does.
   */
  private caption({ speaker, text, translation }: Segment): string {
    const language = this.hasTranslation ? this.captionLanguage : "original";
    const name = this.isSpeakerShown ? speaker : undefined;
    const original = withSpeakerLabel(text, name);
    const translated = withSpeakerLabel(
      translation ?? "",
      name && (this.speakerNames[name] ?? name),
    );
    if (language === "translation") return translated;
    if (language === "original" || !translation) return original;
    return this.bilingualOrder === "translation-first"
      ? `${translated}\n${original}`
      : `${original}\n${translated}`;
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
    this.captionBox.dataset.backdrop = this.captionBackdrop;
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
    this.currentSpeakerTarget.textContent = segment.speaker ?? "";
    this.currentSpeakerTarget.hidden = !segment.speaker;
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

  /** Tells the editor which Segments are being played, each time that changes. */
  private markPlaying(indexes: number[]): void {
    if (indexes.join() === this.playingIndexes.join()) return;
    this.playingIndexes = indexes;
    this.dispatch("playing", { detail: { indexes } });
  }

  private show(project: ProjectView | null): void {
    this.segments = project?.segments ?? [];
    this.hasTranslation = (project?.shown_translation ?? null) !== null;
    this.speakerNames = project?.shown_speaker_names ?? {};
    this.bilingualOrder = project?.options.bilingual_order ?? "original-first";
    this.showCaptionChoice();
    const media = project?.media ?? null;
    this.showCurrentSegment();
    if (media === this.media) {
      this.showCaption(this.segmentIndexesAtTime());
      return;
    }
    this.media = media;
    if (media === null && this.videoWindow) this.closeVideoWindow();
    this.showPanel();
    this.screen.hidden = false;
    this.videoWindowButtonTarget.hidden = false;
    this.player.hidden = false;
    this.unplayableHint.hidden = true;
    this.captionChoiceTarget.hidden = false;
    this.captionBox.textContent = "";
    this.markPlaying([]);
    if (media === null) this.player.removeAttribute("src");
    else this.player.src = convertFileSrc(media);
  }
}
