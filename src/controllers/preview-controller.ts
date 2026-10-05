import { Controller } from "@hotwired/stimulus";

import {
  mediaUrl,
  type ProjectFeed,
  type ProjectOptions,
  type ProjectView,
  type Segment,
} from "../backend/project";
import { isMacOS } from "../backend/system";
import {
  VIDEO_WINDOW,
  destroyVideoWindow,
  leaveVideoWindowFullscreen,
  toggleVideoWindowFullscreen,
} from "../backend/video-window";
import type { EditingSession } from "../editor";
import { t } from "../i18n";
import {
  rememberChoice,
  rememberedChoice,
  rememberedFlag,
  rememberFlag,
} from "../ui/choices";
import { showFold } from "../ui/fold";
import {
  type PlayedSource,
  type Silence,
  isSameSource,
  isSilenceOf,
  playedSource,
  silentWav,
} from "../ui/silence";
import { isShortcut } from "../ui/shortcuts";
import { MS_PER_SECOND, formatClock, formatTime } from "../ui/time";
import { forwardKeys, openVideoWindow } from "../ui/video-window";
import {
  playAtVolume,
  resumeAudioGraph,
  savedVolume,
  SLIDER_END,
  sliderPosition,
  volumeAt,
} from "../ui/volume";

/**
 * Where the webview remembers the player and its controls folded away, under the name a fold of the
 * whole Preview was kept by, so a fold chosen then still holds.
 */
const PLAYER_FOLDED_KEY = "tsuzuri.preview-folded";
/** Where the webview remembers the timeline folded away. */
const TIMELINE_FOLDED_KEY = "tsuzuri.timeline-folded";

/** Which text of the Segment being played is shown over the video. */
type CaptionLanguage = "original" | "translation" | "bilingual";

/** The height of a Dummy Video to its width: 16:9, the shape most videos take. */
const DUMMY_VIDEO_RATIO = 9 / 16;

/** What a Dummy Video is filled with: the dark of most pictures, or the light of a bright scene. */
type DummyVideoColour = "black" | "white";

/** Where the webview remembers the colour of a Dummy Video. */
const DUMMY_VIDEO_KEY = "tsuzuri.preview-dummy-video";

/** Subtitles are most often watched over a dark picture, so a Dummy Video is black until white is chosen. */
function dummyVideoColourOf(value: string | null): DummyVideoColour {
  return value === "white" ? value : "black";
}

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

/** Where the webview remembers how loud the media plays, as a percentage. */
const VOLUME_KEY = "tsuzuri.preview-volume";

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
    "playerFoldButton",
    "timelineFoldButton",
    "timeline",
    "screen",
    "screenRow",
    "media",
    "caption",
    "captionChoice",
    "captionLanguage",
    "captionBackdrop",
    "dummyVideoColour",
    "captionSpeaker",
    "hint",
    "videoWindowButton",
    "playbackIcon",
    "time",
    "volume",
    "volumeLevel",
    "muteButton",
    "muteIcon",
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
  /** Hides or shows the player and its controls; only a Current Resource has them to fold. */
  declare readonly playerFoldButtonTarget: HTMLButtonElement;
  /** Hides or shows the timeline; only a Current Resource has one to fold. */
  declare readonly timelineFoldButtonTarget: HTMLButtonElement;
  /** The Waveform's frame, with its regions and tools. */
  declare readonly timelineTarget: HTMLElement;
  declare readonly screenTarget: HTMLElement;
  /** The row the video sits in beside the card, and comes back to. */
  declare readonly screenRowTarget: HTMLElement;
  declare readonly mediaTarget: HTMLVideoElement;
  declare readonly captionTarget: HTMLElement;
  /** Chooses what is shown over the video and what it sits on; only a picture has one. */
  declare readonly captionChoiceTarget: HTMLElement;
  declare readonly captionLanguageTargets: HTMLInputElement[];
  declare readonly captionBackdropTargets: HTMLInputElement[];
  declare readonly dummyVideoColourTargets: HTMLInputElement[];
  declare readonly captionSpeakerTarget: HTMLInputElement;
  declare readonly hintTarget: HTMLElement;
  /** Moves the video into the Video Window and back; only a picture has one to move. */
  declare readonly videoWindowButtonTarget: HTMLButtonElement;
  declare readonly playbackIconTarget: HTMLElement;
  declare readonly timeTarget: HTMLElement;
  /** The slider setting how loud the media plays beside the system's volume, along a cubic curve. */
  declare readonly volumeTarget: HTMLInputElement;
  declare readonly volumeLevelTarget: HTMLElement;
  declare readonly muteButtonTarget: HTMLElement;
  declare readonly muteIconTarget: HTMLElement;
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

  private source: PlayedSource | null = null;
  /** The object URL of the silence the player reads, released once it reads something else. */
  private silenceUrl: string | null = null;
  private segments: Segment[] = [];
  private playingIndexes: number[] = [];
  private hasTranslation = false;
  private speakerNames: ProjectView["shown_speaker_names"] = {};
  private bilingualOrder: ProjectOptions["bilingual_order"] = "original-first";
  private captionLanguage = captionLanguageOf(rememberedChoice(CAPTION_KEY));
  private captionBackdrop = captionBackdropOf(rememberedChoice(BACKDROP_KEY));
  private dummyVideoColour = dummyVideoColourOf(
    rememberedChoice(DUMMY_VIDEO_KEY),
  );
  /** A saved cue names its Speaker, so the caption does too until turned off. */
  private isSpeakerShown = rememberedFlag(SPEAKER_KEY, true);
  private isPlayerFolded = rememberedFlag(PLAYER_FOLDED_KEY, false);
  private isTimelineFolded = rememberedFlag(TIMELINE_FOLDED_KEY, false);
  private volume = savedVolume(rememberedChoice(VOLUME_KEY));
  /** A mute is not remembered, so a Preview opening silent never passes for media with no sound. */
  private isMuted = false;
  private unfollow?: () => void;
  /** The request for the next frame the Preview follows the media on while it plays, and the window drawing it. */
  private frameRequest: { view: Window; id: number } | null = null;
  /**
   * The player and what is drawn over it, kept from `connect`: the Video Window takes them out of
   * the controller's element, where Stimulus no longer finds them as targets or binds their actions.
   */
  private screen!: HTMLElement;
  private player!: HTMLVideoElement;
  private captionBox!: HTMLElement;
  private unplayableHint!: HTMLElement;
  /** The window the video is in while it is out of the Preview. */
  private videoWindow: Window | null = null;
  /**
   * The last Video Window's removal: until it lands, a window opened by the same name would be
   * the one closing, and take the video away with it.
   */
  private videoWindowRemoval: Promise<void> | null = null;
  private readonly playerListeners: [string, () => void][] = [
    ["loadedmetadata", () => this.measure()],
    ["durationchange", () => this.showTime()],
    ["timeupdate", () => this.follow()],
    ["play", () => this.showPlaying()],
    ["play", () => resumeAudioGraph(this.player)],
    ["pause", () => this.showPaused()],
    ["error", () => this.showUnplayable()],
  ];

  connect(): void {
    this.screen = this.screenTarget;
    this.player = this.mediaTarget;
    this.captionBox = this.captionTarget;
    this.unplayableHint = this.hintTarget;
    for (const [name, listener] of this.playerListeners)
      this.player.addEventListener(name, listener);
    this.player.crossOrigin = "anonymous";
    this.showCaptionBackdrop();
    this.showDummyVideo();
    this.captionSpeakerTarget.checked = this.isSpeakerShown;
    this.volumeTarget.max = String(SLIDER_END);
    this.volumeTarget.value = String(sliderPosition(this.volume));
    this.applyVolume();
    this.unfollow = this.feed.follow((project) => this.show(project));
  }

  disconnect(): void {
    this.unfollow?.();
    this.stopFollowingFrames();
    if (this.videoWindow) this.closeVideoWindow();
    for (const [name, listener] of this.playerListeners)
      this.player.removeEventListener(name, listener);
    this.releaseSilence();
  }

  /** Shows the Current Segment in the card beside the video. */
  showCursor(): void {
    this.showCurrentSegment();
  }

  togglePlayerFold(): void {
    this.isPlayerFolded = !this.isPlayerFolded;
    rememberFlag(PLAYER_FOLDED_KEY, this.isPlayerFolded);
    this.showPanel();
  }

  toggleTimelineFold(): void {
    this.isTimelineFolded = !this.isTimelineFolded;
    rememberFlag(TIMELINE_FOLDED_KEY, this.isTimelineFolded);
    this.showPanel();
  }

  setVolume(): void {
    this.volume = volumeAt(Number(this.volumeTarget.value));
    rememberChoice(VOLUME_KEY, String(this.volume));
    this.isMuted = false;
    this.applyVolume();
  }

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.applyVolume();
  }

  /** Plays the media at the volume chosen, or silent while muted, and shows both beside the slider. */
  private applyVolume(): void {
    playAtVolume(this.player, this.isMuted ? 0 : this.volume);
    this.volumeLevelTarget.textContent = `${Math.round(this.volume)}%`;
    this.muteButtonTarget.setAttribute("aria-pressed", `${this.isMuted}`);
    this.muteButtonTarget.classList.toggle("btn-primary", this.isMuted);
    this.muteIconTarget.classList.toggle("swap-active", this.isMuted);
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

  chooseDummyVideoColour({ target }: Event): void {
    this.dummyVideoColour = (target as HTMLInputElement)
      .value as DummyVideoColour;
    rememberChoice(DUMMY_VIDEO_KEY, this.dummyVideoColour);
    this.showDummyVideo();
  }

  toggleCaptionSpeaker(): void {
    this.isSpeakerShown = this.captionSpeakerTarget.checked;
    rememberFlag(SPEAKER_KEY, this.isSpeakerShown);
    this.showCaption(this.segmentIndexesAtTime());
  }

  toggleVideoWindow(): void {
    if (this.videoWindow) this.closeVideoWindow();
    else if (this.videoWindowRemoval)
      void this.videoWindowRemoval.then(() => this.moveVideoOut());
    else this.moveVideoOut();
  }

  /**
   * Brings the video back as the Video Window is closed. With none of this page's open, as after the
   * page is reloaded, the window it left behind goes all the same.
   */
  closeVideoWindow(): void {
    this.bringVideoBack();
    const removal = destroyVideoWindow().finally(() => {
      if (this.videoWindowRemoval === removal) this.videoWindowRemoval = null;
    });
    this.videoWindowRemoval = removal;
  }

  togglePlayback(): void {
    if (this.player.paused) void this.player.play();
    else this.player.pause();
  }

  /** Sizes the row to the media just loaded, which tells only now whether it has a picture. */
  measure(): void {
    this.fitScreenRow();
    this.showDummyVideo();
    this.showTime();
  }

  showTime(): void {
    const { currentTime, duration } = this.player;
    const length = Number.isFinite(duration) ? duration : 0;
    showText(
      this.timeTarget,
      `${formatClock(currentTime * MS_PER_SECOND)} / ${formatClock(length * MS_PER_SECOND)}`,
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
    if (this.videoWindow) return;
    const videoWindow = openVideoWindow(
      VIDEO_WINDOW,
      t("preview.videoWindowTitle"),
    );
    if (!videoWindow) return;
    forwardKeys(videoWindow);
    videoWindow.addEventListener("keydown", (event) => {
      if (isShortcut(event, "videoWindowFullscreen", isMacOS()))
        void leaveVideoWindowFullscreen();
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
    this.moveScreen(() => this.screenRowTarget.prepend(this.screen));
  }

  /**
   * Moves the player with what is drawn over it between the Preview and the Video Window. A media
   * element moved to another page does not play on by itself: WebKit pauses it, and Chromium loads
   * it again from the start. So it is put back at its time, a playing one plays on, and its frames
   * are followed in the window it is now in.
   */
  private moveScreen(place: () => void): void {
    const { paused, currentTime } = this.player;
    this.stopFollowingFrames();
    place();
    if (this.player.currentTime !== currentTime)
      this.player.currentTime = currentTime;
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
    this.fitScreenRow();
    this.currentSectionTarget.hidden = isAway;
    this.videoWindowButtonTarget.setAttribute("aria-pressed", `${isAway}`);
    this.videoWindowButtonTarget.classList.toggle("btn-primary", isAway);
  }

  /**
   * Gives the row the height its picture takes at the picture's width, up to a limit the page
   * sets, a Dummy Video standing in for media without a picture, and leaves it to the card while
   * the picture is in the Video Window.
   */
  private fitScreenRow(): void {
    const { videoWidth, videoHeight } = this.player;
    const isPictureInRow = this.videoWindow === null;
    this.screenRowTarget.toggleAttribute("data-has-picture", isPictureInRow);
    if (isPictureInRow)
      this.screenRowTarget.style.setProperty(
        "--picture-ratio",
        String(videoWidth > 0 ? videoHeight / videoWidth : DUMMY_VIDEO_RATIO),
      );
  }

  /** The indexes of the Segments at the media's time, in the order they start; none between Segments. */
  private segmentIndexesAtTime(): number[] {
    const at = this.player.currentTime * MS_PER_SECOND;
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
    const originalLine = withSpeakerLabel(text, name);
    const translatedLine = withSpeakerLabel(
      translation ?? "",
      name && (this.speakerNames[name] ?? name),
    );
    if (language === "translation") return translatedLine;
    if (language === "original" || !translation) return originalLine;
    return this.bilingualOrder === "translation-first"
      ? `${translatedLine}\n${originalLine}`
      : `${originalLine}\n${translatedLine}`;
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

  /** Fills the screen with the chosen colour while no picture is there, the choice open only then. */
  private showDummyVideo(): void {
    const hasPicture = this.player.videoWidth > 0;
    if (hasPicture) delete this.screen.dataset.dummyVideo;
    else this.screen.dataset.dummyVideo = this.dummyVideoColour;
    for (const input of this.dummyVideoColourTargets) {
      input.disabled = hasPicture;
      input.checked = input.value === this.dummyVideoColour;
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
    const hasSource = this.source !== null;
    this.panelTarget.hidden =
      !hasSource || (this.isPlayerFolded && this.isTimelineFolded);
    this.screenRowTarget.hidden = this.isPlayerFolded;
    this.timelineTarget.hidden = this.isTimelineFolded;
    this.playerFoldButtonTarget.hidden = !hasSource;
    this.timelineFoldButtonTarget.hidden = !hasSource;
    showFold(this.playerFoldButtonTarget, this.isPlayerFolded);
    showFold(this.timelineFoldButtonTarget, this.isTimelineFolded);
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
    const source = playedSource(project, this.source);
    this.showCurrentSegment();
    if (isSameSource(source, this.source)) {
      this.showCaption(this.segmentIndexesAtTime());
      return;
    }
    const lastSource = this.source;
    this.source = source;
    if (source === null && this.videoWindow) this.closeVideoWindow();
    this.showPanel();
    this.player.hidden = false;
    this.unplayableHint.hidden = true;
    this.captionChoiceTarget.hidden = false;
    this.captionBox.textContent = "";
    this.markPlaying([]);
    this.releaseSilence();
    if (source === null) this.player.removeAttribute("src");
    else if ("media" in source) this.player.src = mediaUrl(source.media);
    else this.playSilence(source, lastSource);
  }

  /**
   * Puts `silence` in the player. Silence made longer for the same Resource goes on from where the
   * last one was, playing if it played, as the user only moved a Segment.
   */
  private playSilence(silence: Silence, lastSource: PlayedSource | null): void {
    const isLengthened = isSilenceOf(lastSource, silence.resource);
    const { currentTime, paused } = this.player;
    this.silenceUrl = URL.createObjectURL(silentWav(silence.lengthMs));
    this.player.src = this.silenceUrl;
    if (!isLengthened) return;
    this.player.currentTime = currentTime;
    if (!paused) void this.player.play();
  }

  private releaseSilence(): void {
    if (this.silenceUrl !== null) URL.revokeObjectURL(this.silenceUrl);
    this.silenceUrl = null;
  }
}
