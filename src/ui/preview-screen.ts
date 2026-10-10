/**
 * The Preview's screen: the player with the Segment being played over it, and the hint that takes
 * the video's place when the media cannot be played. It is made here rather than drawn by a
 * template, as the Video Window takes it out of the page, where no Svelte Component expects a node
 * it drew to go.
 */

import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import { mount, unmount } from "svelte";

/** What the text over the video sits on: a shadow alone, a translucent black or an opaque one. */
export type CaptionBackdrop = "none" | "translucent" | "opaque";

/** What a Dummy Video is filled with: the dark of most pictures, or the light of a bright scene. */
export type DummyVideoColour = "black" | "white";

/** An element named `tag` dressed in `classes`. */
function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes: string,
): HTMLElementTagNameMap[K] {
  const newElement = document.createElement(tag);
  newElement.className = classes;
  return newElement;
}

export class PreviewScreen {
  readonly element = makeElement(
    "div",
    "group relative min-w-0 flex-2 overflow-hidden rounded-box bg-black data-is-away:rounded-none data-[dummy-video=white]:bg-white",
  );
  readonly #media: HTMLVideoElement;
  readonly #caption = makeElement(
    "span",
    "rounded-sm px-1 py-0.5 whitespace-pre-line box-decoration-clone empty:hidden data-[backdrop=opaque]:bg-black data-[backdrop=translucent]:bg-black/60",
  );
  readonly #hint = makeElement(
    "div",
    "alert alert-warning absolute inset-2 text-sm",
  );
  readonly #icon: Record<string, unknown>;
  readonly #hintText = document.createElement("span");

  constructor(media: HTMLVideoElement) {
    this.#media = media;
    media.className = "size-full object-contain";
    media.preload = "metadata";
    media.crossOrigin = "anonymous";
    const line = makeElement(
      "p",
      "pointer-events-none absolute inset-x-2 bottom-2 text-center text-sm text-white [text-shadow:0_1px_2px_black] group-data-is-away:bottom-[4vh] group-data-is-away:text-[4vh]",
    );
    line.append(this.#caption);
    this.#hint.role = "alert";
    this.#hint.hidden = true;
    this.#icon = mount(TriangleAlert, {
      target: this.#hint,
      props: { class: "size-4", "aria-hidden": "true" },
    });
    this.#hint.append(this.#hintText);
    this.element.append(media, line, this.#hint);
  }

  /** Writes what the hint in the video's place says, in the Interface Language as it changes. */
  writeHint(text: string): void {
    this.#hintText.textContent = text;
  }

  /** Puts `text` over the video only when it changes, since the Preview follows the media each frame it plays. */
  showCaption(text: string): void {
    if (this.#caption.textContent !== text) this.#caption.textContent = text;
  }

  showBackdrop(backdrop: CaptionBackdrop): void {
    this.#caption.dataset.backdrop = backdrop;
  }

  /** Fills the screen with `colour` in place of a picture, or leaves it to the picture with none. */
  showDummyVideo(colour: DummyVideoColour | null): void {
    if (colour === null) delete this.element.dataset.dummyVideo;
    else this.element.dataset.dummyVideo = colour;
  }

  /** Puts the hint in the video's place, or the video back. */
  showUnplayable(isUnplayable: boolean): void {
    this.#media.hidden = isUnplayable;
    this.#hint.hidden = !isUnplayable;
  }

  /** Lets the screen fill the Video Window while it is away, its caption grown to the window. */
  showAway(isAway: boolean): void {
    this.element.toggleAttribute("data-is-away", isAway);
  }

  destroy(): void {
    void unmount(this.#icon);
  }
}
