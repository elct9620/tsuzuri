/**
 * The Preview's volume: a slider on Aegisub's curve up to eight times the media's own volume, the
 * part above it played through Web Audio and a limiter (docs/design.md 10.9.1).
 */

/** The loudest a media element plays by itself, as a percentage. */
const FULL_VOLUME = 100;

/** The slider's length; its middle is full volume, as Aegisub's is. */
export const SLIDER_END = 100;

const SLIDER_MIDDLE = SLIDER_END / 2;

/** The limiter's ceiling in dBFS, and how hard it holds the sound past it. */
const LIMIT_DB = -1;
const LIMIT_RATIO = 20;

/**
 * The fixed makeup gain a DynamicsCompressorNode adds to all it passes: its curve at full scale,
 * inverted and raised to 0.6 (Web Audio 1.1, "Computing the makeup gain"), in dB.
 */
const MAKEUP_DB = -0.6 * (LIMIT_DB + (0 - LIMIT_DB) / LIMIT_RATIO);

/** The volume as a percentage at `position` along the slider: the cube of it against the middle. */
export function volumeAt(position: number): number {
  return FULL_VOLUME * (position / SLIDER_MIDDLE) ** 3;
}

/** Where along the slider `volume` percent sits, the nearest step to it. */
export function sliderPosition(volume: number): number {
  return Math.round(SLIDER_MIDDLE * Math.cbrt(volume / FULL_VOLUME));
}

/** The loudest volume the Preview plays, as a percentage. */
const LOUDEST_VOLUME = volumeAt(SLIDER_END);

/** The volume saved as `value`, or full volume where none was saved or it lies outside the slider. */
export function savedVolume(value: string | null): number {
  const volume = Number(value ?? NaN);
  return volume >= 0 && volume <= LOUDEST_VOLUME ? volume : FULL_VOLUME;
}

interface AudioGraph {
  context: AudioContext;
  gain: GainNode;
}

const graphByPlayer = new WeakMap<HTMLMediaElement, AudioGraph>();

/**
 * Plays `player` at `volume` percent. Above full volume it goes through Web Audio, and stays there
 * until the page reloads, since a media element cannot leave the graph it was routed into.
 */
export function playAtVolume(player: HTMLMediaElement, volume: number): void {
  const graph =
    graphByPlayer.get(player) ??
    (volume > FULL_VOLUME ? routeIntoWebAudio(player) : undefined);
  if (!graph) {
    player.volume = volume / FULL_VOLUME;
    return;
  }
  player.volume = 1;
  graph.gain.gain.value = volume / FULL_VOLUME;
}

function routeIntoWebAudio(player: HTMLMediaElement): AudioGraph {
  const context = new AudioContext();
  const gain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = LIMIT_RATIO;
  const makeupRemoval = context.createGain();
  makeupRemoval.gain.value = 10 ** (-MAKEUP_DB / 20);
  context
    .createMediaElementSource(player)
    .connect(gain)
    .connect(limiter)
    .connect(makeupRemoval)
    .connect(context.destination);
  const graph = { context, gain };
  graphByPlayer.set(player, graph);
  return graph;
}

/** Lets `player` be heard through Web Audio: a context made without a user's gesture starts suspended. */
export function resumeAudioGraph(player: HTMLMediaElement): void {
  void graphByPlayer.get(player)?.context.resume();
}
