/**
 * Which parts of the Preview are folded away, which the edit tools' buttons turn and the Preview
 * shows.
 */

import { rememberFlag, rememberedFlag } from "#/ui/choices.ts";

/**
 * Where the webview remembers the player and its controls folded away, under the name a fold of the
 * whole Preview was kept by, so a fold chosen then still holds.
 */
const PLAYER_FOLDED_KEY = "tsuzuri.preview-folded";
/** Where the webview remembers the timeline folded away. */
const TIMELINE_FOLDED_KEY = "tsuzuri.timeline-folded";

export class PreviewFold {
  isPlayerFolded = $state(rememberedFlag(PLAYER_FOLDED_KEY, false));
  isTimelineFolded = $state(rememberedFlag(TIMELINE_FOLDED_KEY, false));

  togglePlayer(): void {
    this.isPlayerFolded = !this.isPlayerFolded;
    rememberFlag(PLAYER_FOLDED_KEY, this.isPlayerFolded);
  }

  toggleTimeline(): void {
    this.isTimelineFolded = !this.isTimelineFolded;
    rememberFlag(TIMELINE_FOLDED_KEY, this.isTimelineFolded);
  }
}
