/**
 * How the Preview shows captions over the video, chosen in its caption controls and remembered on
 * this machine: the language, the backdrop, the colour of a Dummy Video and the Speaker.
 */

import {
  rememberChoice,
  rememberedChoice,
  rememberFlag,
  rememberedFlag,
} from "#/ui/choices.ts";
import type { CaptionBackdrop, DummyVideoColour } from "#/ui/preview-screen.ts";

/** Which text of the Segment being played is shown over the video. */
export type CaptionLanguage = "original" | "translation" | "bilingual";

/** Where the webview remembers the colour of a Dummy Video. */
const DUMMY_VIDEO_KEY = "tsuzuri.preview-dummy-video";
/** Where the webview remembers what is shown over the video. */
const CAPTION_KEY = "tsuzuri.preview-caption";
/** Where the webview remembers the backdrop over the video. */
const BACKDROP_KEY = "tsuzuri.preview-backdrop";
/** Where the webview remembers the Speaker over the video turned off. */
const SPEAKER_KEY = "tsuzuri.preview-speaker";

/** Subtitles are most often watched over a dark picture, so a Dummy Video is black until white is chosen. */
function dummyVideoColourOf(value: string | null): DummyVideoColour {
  return value === "white" ? value : "black";
}

function captionLanguageOf(value: string | null): CaptionLanguage {
  return value === "translation" || value === "bilingual" ? value : "original";
}

/** A shadow alone is lost on a bright picture, so a caption sits on a backdrop until taken away. */
function captionBackdropOf(value: string | null): CaptionBackdrop {
  return value === "none" || value === "opaque" ? value : "translucent";
}

export class CaptionChoices {
  language = $state(captionLanguageOf(rememberedChoice(CAPTION_KEY)));
  backdrop = $state(captionBackdropOf(rememberedChoice(BACKDROP_KEY)));
  dummyVideoColour = $state(
    dummyVideoColourOf(rememberedChoice(DUMMY_VIDEO_KEY)),
  );
  /** A saved cue names its Speaker, so the caption does too until turned off. */
  isSpeakerShown = $state(rememberedFlag(SPEAKER_KEY, true));

  /** What is shown over the video: the translation only while one is shown, the choice kept for when one is again. */
  shownLanguage(hasTranslation: boolean): CaptionLanguage {
    return hasTranslation ? this.language : "original";
  }

  chooseLanguage(language: CaptionLanguage): void {
    this.language = language;
    rememberChoice(CAPTION_KEY, language);
  }

  chooseBackdrop(backdrop: CaptionBackdrop): void {
    this.backdrop = backdrop;
    rememberChoice(BACKDROP_KEY, backdrop);
  }

  chooseDummyVideoColour(colour: DummyVideoColour): void {
    this.dummyVideoColour = colour;
    rememberChoice(DUMMY_VIDEO_KEY, colour);
  }

  toggleSpeaker(isShown: boolean): void {
    this.isSpeakerShown = isShown;
    rememberFlag(SPEAKER_KEY, isShown);
  }
}
