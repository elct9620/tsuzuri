/**
 * Which arrangement of the editor's regions is on screen while the layouts are tried, chosen in the
 * Preferences tab and remembered on this machine.
 */

import { rememberChoice, rememberedChoice } from "#/ui/choices.ts";

/**
 * The arrangements on trial, until one is kept: V1 shows the Current Segment's card beside the
 * video, V2 unfolds its row in the Segment list instead, and V3 does so with the video beside the
 * list in a wide editor.
 */
export type Layout = "v1" | "v2" | "v3";

/** Each Layout, in the order the Preferences tab offers them. */
export const LAYOUTS: readonly Layout[] = ["v1", "v2", "v3"];

/** Where the webview remembers the Layout chosen. */
const LAYOUT_KEY = "tsuzuri.layout";

function layoutOf(value: string | null): Layout {
  return LAYOUTS.find((layout) => layout === value) ?? "v1";
}

/** Whether the Current Segment's row unfolds to carry what the card would show. */
export function hasUnfoldedCurrentRow(layout: Layout): boolean {
  return layout !== "v1";
}

export class LayoutChoice {
  /** The Layout chosen, V1 until another is: the editor as it was before any was tried. */
  layout = $state(layoutOf(rememberedChoice(LAYOUT_KEY)));

  choose(layout: Layout): void {
    this.layout = layout;
    rememberChoice(LAYOUT_KEY, layout);
  }
}
