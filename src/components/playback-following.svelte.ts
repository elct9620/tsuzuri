/**
 * Whether the Segment list scrolls to the row being played, which the Preview's button turns on
 * or off and the list follows.
 */

import { rememberFlag, rememberedFlag } from "../ui/choices";

/** Where the webview remembers whether the editor follows playback. */
const FOLLOWING_KEY = "tsuzuri.transcript-following";

/** Following playback, on unless turned off on this machine; turned off, the list stays where the user left it. */
export class PlaybackFollowing {
  isOn = $state(rememberedFlag(FOLLOWING_KEY, true));

  toggle(): void {
    this.isOn = !this.isOn;
    rememberFlag(FOLLOWING_KEY, this.isOn);
  }
}
