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
