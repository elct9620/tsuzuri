<!--
  @component
  The Preview's player controls: playing and pausing, where the media is, the Video Window, the
  volume and what is shown over the video, with the Current Segment's card beneath while the video
  is on the page.
-->
<script module lang="ts">
  /** Where the webview remembers how loud the media plays, as a percentage. */
  const VOLUME_KEY = "tsuzuri.preview-volume";
</script>

<script lang="ts">
  import ArrowRightToLine from "@lucide/svelte/icons/arrow-right-to-line";
  import LocateFixed from "@lucide/svelte/icons/locate-fixed";
  import Pause from "@lucide/svelte/icons/pause";
  import PictureInPicture2 from "@lucide/svelte/icons/picture-in-picture-2";
  import Play from "@lucide/svelte/icons/play";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { untrack } from "svelte";

  import type { Segment } from "#/ipc/project.ts";
  import { t } from "#/i18n.ts";
  import { rememberChoice, rememberedChoice } from "#/ui/choices.ts";
  import {
    playAtVolume,
    savedVolume,
    SLIDER_END,
    sliderPosition,
    volumeAt,
  } from "#/ui/volume.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import CaptionControls from "#/components/CaptionControls.svelte";
  import CurrentSegmentCard from "#/components/CurrentSegmentCard.svelte";

  let {
    playback,
    segments,
    choices,
    clock,
    isPlaying,
    isAway,
    isUnplayable,
    hasTranslation,
    hasPicture,
    toggleVideoWindow,
  }: {
    playback: Playback;
    segments: Segment[];
    choices: CaptionChoices;
    /** Where the media is and how long it lasts. */
    clock: string;
    isPlaying: boolean;
    /** Whether the video is out in the Video Window. */
    isAway: boolean;
    isUnplayable: boolean;
    hasTranslation: boolean;
    hasPicture: boolean;
    toggleVideoWindow: () => void;
  } = $props();

  /** The player stays the same for as long as the page does. */
  const media = untrack(() => playback.media);
  let volume = $state(savedVolume(rememberedChoice(VOLUME_KEY)));
  /** A mute is not remembered, so a Preview opening silent never passes for media with no sound. */
  let isMuted = $state(false);

  applyVolume();

  /** Plays the media at the volume chosen, or silent while muted. */
  function applyVolume(): void {
    playAtVolume(media, isMuted ? 0 : volume);
  }

  function setVolume(position: number): void {
    volume = volumeAt(position);
    rememberChoice(VOLUME_KEY, String(volume));
    isMuted = false;
    applyVolume();
  }

  function toggleMute(): void {
    isMuted = !isMuted;
    applyVolume();
  }

  function togglePlayback(): void {
    if (media.paused) void media.play();
    else media.pause();
  }
</script>

<div class="card card-sm card-border min-w-0 flex-3">
  <div class="card-body">
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="btn btn-circle"
        aria-label={t("preview.play")}
        onclick={togglePlayback}
      >
        <span class={["swap", isPlaying && "swap-active"]}>
          <Pause class="swap-on size-5" aria-hidden="true" />
          <Play class="swap-off size-5" aria-hidden="true" />
        </span>
      </button>
      <button
        type="button"
        class={["btn btn-square btn-sm", playback.isFollowing && "btn-primary"]}
        aria-pressed={playback.isFollowing}
        aria-label={t("preview.following")}
        data-tooltip={t("preview.followingHint")}
        data-shortcut="following"
        onclick={() => playback.toggleFollowing()}
      >
        <LocateFixed class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class={[
          "btn btn-square btn-sm",
          playback.isPlayingAlone && "btn-primary",
        ]}
        aria-pressed={playback.isPlayingAlone}
        aria-label={t("preview.playingAlone")}
        data-tooltip={t("preview.playingAloneHint")}
        onclick={() => playback.togglePlayingAlone()}
      >
        <ArrowRightToLine class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class={["btn btn-square btn-sm", isAway && "btn-primary"]}
        aria-pressed={isAway}
        aria-label={t("preview.videoWindow")}
        data-tooltip={t("preview.videoWindowHint")}
        onclick={toggleVideoWindow}
      >
        <PictureInPicture2 class="size-4" aria-hidden="true" />
      </button>
      <span
        role="timer"
        class="text-lg font-medium whitespace-nowrap tabular-nums">{clock}</span
      >
      <div class="flex items-center gap-2">
        <button
          type="button"
          class={["btn btn-square btn-sm", isMuted && "btn-primary"]}
          aria-pressed={isMuted}
          aria-label={t("preview.mute")}
          data-tooltip={t("preview.muteHint")}
          onclick={toggleMute}
        >
          <span class={["swap", isMuted && "swap-active"]}>
            <VolumeX class="swap-on size-4" aria-hidden="true" />
            <Volume2 class="swap-off size-4" aria-hidden="true" />
          </span>
        </button>
        <input
          type="range"
          min="0"
          max={SLIDER_END}
          value={sliderPosition(volume)}
          class="range range-sm w-24"
          aria-label={t("preview.volume")}
          oninput={(event) => setVolume(Number(event.currentTarget.value))}
        />
        <span class="w-10 text-right text-sm tabular-nums"
          >{Math.round(volume)}%</span
        >
      </div>
      {#if !isUnplayable}
        <CaptionControls {choices} {hasTranslation} {hasPicture} />
      {/if}
    </div>
    {#if !isAway}
      <div class="divider my-0"></div>
      <CurrentSegmentCard {segments} {playback} />
    {/if}
  </div>
</div>
