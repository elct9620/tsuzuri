/**
 * The Current Resource's media as the Preview plays it, shared by what follows it: the player the
 * Preview shows and the timeline drives, the Segments being played, whether Space plays the
 * Current Segment alone, and whether the Segment list scrolls to the row being played.
 */

import { rememberFlag, rememberedFlag } from "../ui/choices";

/** Where the webview remembers whether the editor follows playback. */
const FOLLOWING_KEY = "tsuzuri.transcript-following";
/** Where the webview remembers whether Space plays the Current Segment alone. */
const ALONE_KEY = "tsuzuri.timeline-playing-alone";

export class Playback {
  /**
   * The one player, made here rather than drawn by a template: the Video Window takes it out of
   * the page, where no Svelte Component expects a node it drew to go.
   */
  readonly media = document.createElement("video");
  /** The positions of the Segments being played, in the order they start; none while paused. */
  playingIndexes = $state.raw<number[]>([]);
  /** Following playback, on unless turned off on this machine; turned off, the list stays where the user left it. */
  isFollowing = $state(rememberedFlag(FOLLOWING_KEY, true));
  /** Whether Space plays the Current Segment alone and stops at its end, rather than on from where the media is. */
  isPlayingAlone = $state(rememberedFlag(ALONE_KEY, false));

  /** Notes the Segments at `indexes` as being played, only when they differ from those noted. */
  markPlaying(indexes: number[]): void {
    if (indexes.join() !== this.playingIndexes.join())
      this.playingIndexes = indexes;
  }

  toggleFollowing(): void {
    this.isFollowing = !this.isFollowing;
    rememberFlag(FOLLOWING_KEY, this.isFollowing);
  }

  togglePlayingAlone(): void {
    this.isPlayingAlone = !this.isPlayingAlone;
    rememberFlag(ALONE_KEY, this.isPlayingAlone);
  }
}
