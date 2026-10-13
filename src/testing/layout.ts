import { vi } from "vitest";

/** happy-dom has no canvas; painting a Waveform onto this does nothing. */
const PAINTLESS_CONTEXT = new Proxy(
  {},
  { get: () => () => undefined, set: () => true },
) as unknown as RenderingContext;

/**
 * Gives every element `width` pixels and a canvas to paint on, which happy-dom lacks: the
 * timeline shows only the regions inside its width. Answers the function that takes both back.
 */
export function layOutTimeline(width = 50): () => void {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(PAINTLESS_CONTEXT);
  return () => {
    if (clientWidthDescriptor)
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        clientWidthDescriptor,
      );
    getContext.mockRestore();
  };
}

/** A Segment list laid out on a screen, scrolled as a test asks. */
export interface LaidOutSegmentList {
  /** Scrolls the list `top` pixels past its first row, as the user does. */
  scrollTo(top: number): void;
  /** Takes the layout back. */
  restore(): void;
}

/**
 * Lays the Segment list out on a window `height` pixels tall, which happy-dom lacks, so the list
 * draws only the rows near what shows; the rows keep the height they are taken to be.
 */
export function layOutSegmentList(height = 800): LaidOutSegmentList {
  let scrolled = 0;
  const box = vi
    .spyOn(HTMLOListElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => new DOMRect(0, -scrolled, 600, height));
  const windowHeight = vi
    .spyOn(window, "innerHeight", "get")
    .mockReturnValue(height);
  return {
    scrollTo(top) {
      scrolled = top;
      document.body.dispatchEvent(new Event("scroll"));
    },
    restore() {
      box.mockRestore();
      windowHeight.mockRestore();
    },
  };
}

/** A ResizeObserver the page made: what it watches, and how to tell it those resized. */
export interface WatchedResizes {
  targets: Element[];
  notify: (entries: ResizeObserverEntry[]) => void;
}

/**
 * Puts a ResizeObserver in place of the one happy-dom lacks; answers each one the page makes,
 * which a test tells of resizes as the browser would once it lays them out.
 */
export function stubResizeObserver(): WatchedResizes[] {
  const observers: WatchedResizes[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly watched: WatchedResizes;
      constructor(notify: WatchedResizes["notify"]) {
        this.watched = { targets: [], notify };
        observers.push(this.watched);
      }
      observe(target: Element) {
        this.watched.targets.push(target);
      }
      disconnect() {
        this.watched.targets = [];
      }
    },
  );
  return observers;
}
