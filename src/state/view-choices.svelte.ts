/**
 * What the View menu chooses beside the Preview's own choices, remembered on this machine: whether
 * the timeline Snaps a dragged edge, and whether rows show the Speaker column with no Speaker named.
 */

import { rememberFlag, rememberedFlag } from "#/ui/choices.ts";

/** Where the webview remembers whether the timeline Snaps. */
const SNAPPING_KEY = "tsuzuri.timeline-snapping";
/** Where the webview remembers the Speaker column shown for a subtitle naming no Speaker. */
const SPEAKER_COLUMN_KEY = "tsuzuri.speaker-column";

export class ViewChoices {
  /** Whether a dragged edge Snaps, which Shift reverses for one drag; off unless chosen, as in Aegisub. */
  isSnapping = $state(rememberedFlag(SNAPPING_KEY, false));
  /** Whether rows show the Speaker column even where no Segment names a Speaker. */
  isSpeakerColumnShown = $state(rememberedFlag(SPEAKER_COLUMN_KEY, false));

  toggleSnapping(): void {
    this.isSnapping = !this.isSnapping;
    rememberFlag(SNAPPING_KEY, this.isSnapping);
  }

  toggleSpeakerColumn(): void {
    this.isSpeakerColumnShown = !this.isSpeakerColumnShown;
    rememberFlag(SPEAKER_COLUMN_KEY, this.isSpeakerColumnShown);
  }
}
