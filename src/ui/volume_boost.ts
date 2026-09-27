/**
 * The Volume Boost: the Preview playing above the media's own volume through Web Audio, an
 * experiment whose sound may lag behind the picture (docs/design.md 10.9.1).
 */
import { rememberedFlag, rememberFlag } from "./choices";

/** Where the webview remembers the Volume Boost turned on. */
const VOLUME_BOOST_KEY = "tsuzuri.volume-boost";

/** The loudest a media element plays by itself, as a percentage. */
const FULL_VOLUME = 100;

/** The loudest the Volume Boost plays, as a percentage. */
const BOOSTED_VOLUME = 200;

/** Whether the Volume Boost is turned on on this machine; the Preview reads it once as it opens. */
export function isVolumeBoostOn(): boolean {
  return rememberedFlag(VOLUME_BOOST_KEY, false);
}

export function chooseVolumeBoost(isOn: boolean): void {
  rememberFlag(VOLUME_BOOST_KEY, isOn);
}

/** The loudest volume the Preview offers, as a percentage. */
export function volumeLimit(isBoostOn: boolean): number {
  return isBoostOn ? BOOSTED_VOLUME : FULL_VOLUME;
}

interface Boost {
  context: AudioContext;
  gain: GainNode;
}

const boostByPlayer = new WeakMap<HTMLMediaElement, Boost>();

/** The context the last boosted player plays through, whose latency the settings show. */
let boostedContext: AudioContext | null = null;

/**
 * Plays `player` at `volume` percent. Above full volume it goes through Web Audio, and stays there
 * until the page reloads, since a media element cannot leave the graph it was routed into.
 */
export function playAtVolume(player: HTMLMediaElement, volume: number): void {
  const boost =
    boostByPlayer.get(player) ??
    (volume > FULL_VOLUME ? boostPlayer(player) : undefined);
  if (!boost) {
    player.volume = volume / FULL_VOLUME;
    return;
  }
  player.volume = 1;
  boost.gain.gain.value = volume / FULL_VOLUME;
}

function boostPlayer(player: HTMLMediaElement): Boost {
  const context = new AudioContext();
  const gain = context.createGain();
  context
    .createMediaElementSource(player)
    .connect(gain)
    .connect(context.destination);
  const boost = { context, gain };
  boostByPlayer.set(player, boost);
  boostedContext = context;
  return boost;
}

/** Lets a boosted `player` be heard: a context made without a user's gesture starts suspended. */
export function resumeVolumeBoost(player: HTMLMediaElement): void {
  void boostByPlayer.get(player)?.context.resume();
}

/** How many milliseconds the boosted sound takes to reach the speakers; none before any boost. */
export function outputLatencyMs(): number | null {
  if (!boostedContext) return null;
  const { baseLatency, outputLatency } = boostedContext;
  return Math.round((baseLatency + (outputLatency ?? 0)) * 1000);
}
