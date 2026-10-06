<!--
  @component
  The Preview: the Current Resource's media, played whole, with the Segment being played over it,
  its controls, the Current Segment's card beside it and the timeline beneath. The screen the media
  plays on is a `PreviewScreen`, which the Video Window takes out of the page and gives back.
-->
<script module lang="ts">
  /** Which text of the Segment being played is shown over the video. */
  type CaptionLanguage = "original" | "translation" | "bilingual";

  /** The height of a Dummy Video to its width: 16:9, the shape most videos take. */
  const DUMMY_VIDEO_RATIO = 9 / 16;
  /** Where the webview remembers the colour of a Dummy Video. */
  const DUMMY_VIDEO_KEY = "tsuzuri.preview-dummy-video";
  /** Where the webview remembers what is shown over the video. */
  const CAPTION_KEY = "tsuzuri.preview-caption";
  /** Where the webview remembers the backdrop over the video. */
  const BACKDROP_KEY = "tsuzuri.preview-backdrop";
  /** Where the webview remembers how loud the media plays, as a percentage. */
  const VOLUME_KEY = "tsuzuri.preview-volume";
  /** Where the webview remembers the Speaker over the video turned off. */
  const SPEAKER_KEY = "tsuzuri.preview-speaker";

  const CAPTION_LANGUAGES: { value: CaptionLanguage; label: string }[] = [
    { value: "original", label: "preview.captionOriginal" },
    { value: "translation", label: "preview.captionTranslation" },
    { value: "bilingual", label: "preview.captionBilingual" },
  ];
  const CAPTION_BACKDROPS: { value: CaptionBackdrop; label: string }[] = [
    { value: "none", label: "preview.captionBackdropNone" },
    { value: "translucent", label: "preview.captionBackdropTranslucent" },
    { value: "opaque", label: "preview.captionBackdropOpaque" },
  ];
  const DUMMY_VIDEO_COLOURS: { value: DummyVideoColour; label: string }[] = [
    { value: "black", label: "preview.dummyVideoBlack" },
    { value: "white", label: "preview.dummyVideoWhite" },
  ];

  /** Subtitles are most often watched over a dark picture, so a Dummy Video is black until white is chosen. */
  function dummyVideoColourOf(value: string | null): DummyVideoColour {
    return value === "white" ? value : "black";
  }

  function captionLanguageOf(value: string | null): CaptionLanguage {
    return value === "translation" || value === "bilingual"
      ? value
      : "original";
  }

  /** A shadow alone is lost on a bright picture, so a caption sits on a backdrop until taken away. */
  function captionBackdropOf(value: string | null): CaptionBackdrop {
    return value === "none" || value === "opaque" ? value : "translucent";
  }

  /** `text` after a Speaker Label naming `name`, as a cue names its Speaker; with nothing to say, no one is named. */
  function withSpeakerLabel(text: string, name: string | undefined): string {
    return name && text ? `${name}: ${text}` : text;
  }
</script>

<script lang="ts">
  import ArrowRightToLine from "@lucide/svelte/icons/arrow-right-to-line";
  import Captions from "@lucide/svelte/icons/captions";
  import LocateFixed from "@lucide/svelte/icons/locate-fixed";
  import Pause from "@lucide/svelte/icons/pause";
  import PictureInPicture2 from "@lucide/svelte/icons/picture-in-picture-2";
  import Play from "@lucide/svelte/icons/play";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { onMount, untrack } from "svelte";

  import { mediaUrl, type ProjectView, type Segment } from "#/ipc/project.ts";
  import { isMacOS } from "#/ipc/system.ts";
  import {
    VIDEO_WINDOW,
    destroyVideoWindow,
    leaveVideoWindowFullscreen,
    toggleVideoWindowFullscreen,
  } from "#/ipc/video-window.ts";
  import { t } from "#/i18n.ts";
  import {
    rememberChoice,
    rememberedChoice,
    rememberedFlag,
    rememberFlag,
  } from "#/ui/choices.ts";
  import {
    type PlayedSource,
    type Silence,
    isSameSource,
    isSilenceOf,
    playedSource,
    silentWav,
  } from "#/ui/silence.ts";
  import { isShortcut } from "#/ui/shortcuts.ts";
  import { MS_PER_SECOND, formatClock, formatTime } from "#/ui/time.ts";
  import { forwardKeys, openVideoWindow } from "#/ui/video-window.ts";
  import {
    playAtVolume,
    resumeAudioGraph,
    savedVolume,
    SLIDER_END,
    sliderPosition,
    volumeAt,
  } from "#/ui/volume.ts";
  import { editingSession, projectFeed } from "#/state/context.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { PreviewFold } from "#/state/preview-fold.svelte.ts";
  import {
    type CaptionBackdrop,
    type DummyVideoColour,
    PreviewScreen,
  } from "#/ui/preview-screen.ts";
  import Timeline, { timeKeys } from "#/components/Timeline.svelte";

  let { playback, fold }: { playback: Playback; fold: PreviewFold } = $props();

  const feed = projectFeed();
  const session = editingSession();
  /** The player stays the same for as long as the page does. */
  const media = untrack(() => playback.media);
  const screen = new PreviewScreen(media);
  const keys = timeKeys(isMacOS());

  let project = $state.raw<ProjectView | null>(null);
  let source = $state.raw<PlayedSource | null>(null);
  /** The object URL of the silence the player reads, released once it reads something else. */
  let silenceUrl: string | null = null;
  let captionLanguage = $state(
    captionLanguageOf(rememberedChoice(CAPTION_KEY)),
  );
  let captionBackdrop = $state(
    captionBackdropOf(rememberedChoice(BACKDROP_KEY)),
  );
  let dummyVideoColour = $state(
    dummyVideoColourOf(rememberedChoice(DUMMY_VIDEO_KEY)),
  );
  /** A saved cue names its Speaker, so the caption does too until turned off. */
  let isSpeakerShown = $state(rememberedFlag(SPEAKER_KEY, true));
  let volume = $state(savedVolume(rememberedChoice(VOLUME_KEY)));
  /** A mute is not remembered, so a Preview opening silent never passes for media with no sound. */
  let isMuted = $state(false);
  let isPlaying = $state(false);
  let isUnplayable = $state(false);
  /** Where the media is and how long it lasts. */
  let clock = $state("");
  /** Whether the media just loaded has a picture, which tells only once its metadata arrives. */
  let hasPicture = $state(false);
  /** The height the row beside the card takes for its picture at the picture's width, once measured. */
  let pictureRatio = $state<number | null>(null);
  let currentIndex = $state<number | null>(null);
  /** The window the video is in while it is out of the Preview. */
  let videoWindow = $state.raw<Window | null>(null);
  /**
   * The last Video Window's removal: until it lands, a window opened by the same name would be
   * the one closing, and take the video away with it.
   */
  let videoWindowRemoval: Promise<void> | null = null;
  /** The request for the next frame the Preview follows the media on while it plays, and the window drawing it. */
  let frameRequest: { view: Window; id: number } | null = null;
  /** The row the video sits in beside the card, and comes back to. */
  let screenRow: HTMLElement;

  const segments = $derived(project?.segments ?? []);
  const hasTranslation = $derived(
    (project?.shown_translation ?? null) !== null,
  );
  /** What is shown over the video: the translation only while one is shown, the choice kept for when one is again. */
  const shownLanguage = $derived(hasTranslation ? captionLanguage : "original");
  const currentSegment = $derived(
    currentIndex === null ? undefined : segments[currentIndex],
  );
  const isAway = $derived(videoWindow !== null);

  screen.showBackdrop(untrack(() => captionBackdrop));
  showDummyVideo();
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

  function chooseCaptionLanguage(language: CaptionLanguage): void {
    captionLanguage = language;
    rememberChoice(CAPTION_KEY, language);
    showCaptionAtTime();
  }

  function chooseCaptionBackdrop(backdrop: CaptionBackdrop): void {
    captionBackdrop = backdrop;
    rememberChoice(BACKDROP_KEY, backdrop);
    screen.showBackdrop(backdrop);
  }

  function chooseDummyVideoColour(colour: DummyVideoColour): void {
    dummyVideoColour = colour;
    rememberChoice(DUMMY_VIDEO_KEY, colour);
    showDummyVideo();
  }

  function toggleCaptionSpeaker(isShown: boolean): void {
    isSpeakerShown = isShown;
    rememberFlag(SPEAKER_KEY, isShown);
    showCaptionAtTime();
  }

  function toggleVideoWindow(): void {
    if (videoWindow) closeVideoWindow();
    else if (videoWindowRemoval)
      void videoWindowRemoval.then(() => moveVideoOut());
    else moveVideoOut();
  }

  /**
   * Brings the video back as the Video Window is closed. With none of this page's open, as after the
   * page is reloaded, the window it left behind goes all the same.
   */
  function closeVideoWindow(): void {
    bringVideoBack();
    const removal = destroyVideoWindow().finally(() => {
      if (videoWindowRemoval === removal) videoWindowRemoval = null;
    });
    videoWindowRemoval = removal;
  }

  function togglePlayback(): void {
    if (media.paused) void media.play();
    else media.pause();
  }

  /** Sizes the row to the media just loaded, which tells only now whether it has a picture. */
  function measure(): void {
    hasPicture = media.videoWidth > 0;
    fitScreenRow();
    showDummyVideo();
    showTime();
  }

  function showTime(): void {
    const { currentTime, duration } = media;
    const length = Number.isFinite(duration) ? duration : 0;
    clock = `${formatClock(currentTime * MS_PER_SECOND)} / ${formatClock(length * MS_PER_SECOND)}`;
  }

  function follow(): void {
    showTime();
    const indexes = segmentIndexesAtTime();
    showCaption(indexes);
    playback.markPlaying(media.paused ? [] : indexes);
  }

  function showPlaying(): void {
    isPlaying = true;
    followFrames();
  }

  function showPaused(): void {
    isPlaying = false;
    stopFollowingFrames();
    playback.markPlaying([]);
  }

  function showUnplayable(): void {
    isUnplayable = true;
    screen.showUnplayable(true);
  }

  /**
   * A player reports its time only a few times a second, so while it plays the Preview follows
   * each frame drawn, and a caption comes with its words. The frames are those of the window the
   * video is in, which keeps drawing while the main window is behind another.
   */
  function followFrames(): void {
    if (frameRequest !== null) return;
    const view = media.ownerDocument.defaultView ?? window;
    const onFrame = () => {
      frameRequest = null;
      follow();
      if (!media.paused) followFrames();
    };
    frameRequest = { view, id: view.requestAnimationFrame(onFrame) };
  }

  function stopFollowingFrames(): void {
    frameRequest?.view.cancelAnimationFrame(frameRequest.id);
    frameRequest = null;
  }

  function moveVideoOut(): void {
    if (videoWindow) return;
    const newWindow = openVideoWindow(
      VIDEO_WINDOW,
      t("preview.videoWindowTitle"),
    );
    if (!newWindow) return;
    forwardKeys(newWindow);
    newWindow.addEventListener("keydown", (event) => {
      if (isShortcut(event, "videoWindowFullscreen", isMacOS()))
        void leaveVideoWindowFullscreen();
    });
    newWindow.addEventListener(
      "dblclick",
      () => void toggleVideoWindowFullscreen(),
    );
    videoWindow = newWindow;
    moveScreen(() => newWindow.document.body.append(screen.element));
  }

  function bringVideoBack(): void {
    if (!videoWindow) return;
    videoWindow = null;
    moveScreen(() => screenRow.prepend(screen.element));
  }

  /**
   * Moves the player with what is drawn over it between the Preview and the Video Window. A media
   * element moved to another page does not play on by itself: WebKit pauses it, and Chromium loads
   * it again from the start. So it is put back at its time, a playing one plays on, and its frames
   * are followed in the window it is now in.
   */
  function moveScreen(place: () => void): void {
    const { paused, currentTime } = media;
    stopFollowingFrames();
    place();
    if (media.currentTime !== currentTime) media.currentTime = currentTime;
    screen.showAway(videoWindow !== null);
    if (!paused && media.paused) void media.play();
    if (!media.paused) followFrames();
    fitScreenRow();
  }

  /**
   * Gives the row the height its picture takes at the picture's width, up to a limit the page
   * sets, a Dummy Video standing in for media without a picture; while the picture is in the Video
   * Window the row is left to the card.
   */
  function fitScreenRow(): void {
    const { videoWidth, videoHeight } = media;
    if (videoWindow === null)
      pictureRatio =
        videoWidth > 0 ? videoHeight / videoWidth : DUMMY_VIDEO_RATIO;
  }

  /** The indexes of the Segments at the media's time, in the order they start; none between Segments. */
  function segmentIndexesAtTime(): number[] {
    const at = media.currentTime * MS_PER_SECOND;
    return segments.flatMap((segment, index) =>
      segment.start_ms <= at && at < segment.end_ms ? [index] : [],
    );
  }

  function showCaptionAtTime(): void {
    showCaption(segmentIndexesAtTime());
  }

  /** Shows the Segments at `indexes` over the video, each above those that started before it. */
  function showCaption(indexes: number[]): void {
    const captions = indexes.map((index) => caption(segments[index]));
    screen.showCaption(captions.reverse().join("\n"));
  }

  /**
   * The text over the video, laid out as a Bilingual SRT cue lays out both languages, each
   * naming the Speaker as that language's subtitle does.
   */
  function caption({ speaker, text, translation }: Segment): string {
    const name = isSpeakerShown ? speaker : undefined;
    const originalLine = withSpeakerLabel(text, name);
    const translatedLine = withSpeakerLabel(
      translation ?? "",
      name && (project?.shown_speaker_names[name] ?? name),
    );
    if (shownLanguage === "translation") return translatedLine;
    if (shownLanguage === "original" || !translation) return originalLine;
    return project?.options.bilingual_order === "translation-first"
      ? `${translatedLine}\n${originalLine}`
      : `${originalLine}\n${translatedLine}`;
  }

  /** Fills the screen with the chosen colour while no picture is there, the choice open only then. */
  function showDummyVideo(): void {
    screen.showDummyVideo(media.videoWidth > 0 ? null : dummyVideoColour);
  }

  function show(next: ProjectView | null): void {
    project = next;
    currentIndex = session.cursor.index;
    const nextSource = playedSource(next, source);
    if (isSameSource(nextSource, source)) {
      showCaptionAtTime();
      return;
    }
    const lastSource = source;
    source = nextSource;
    if (nextSource === null && videoWindow) closeVideoWindow();
    isUnplayable = false;
    screen.showUnplayable(false);
    screen.showCaption("");
    playback.markPlaying([]);
    releaseSilence();
    if (nextSource === null) media.removeAttribute("src");
    else if ("media" in nextSource) media.src = mediaUrl(nextSource.media);
    else playSilence(nextSource, lastSource);
  }

  /**
   * Puts `silence` in the player. Silence made longer for the same Resource goes on from where the
   * last one was, playing if it played, as the user only moved a Segment.
   */
  function playSilence(
    silence: Silence,
    lastSource: PlayedSource | null,
  ): void {
    const isLengthened = isSilenceOf(lastSource, silence.resource);
    const { currentTime, paused } = media;
    silenceUrl = URL.createObjectURL(silentWav(silence.lengthMs));
    media.src = silenceUrl;
    if (!isLengthened) return;
    media.currentTime = currentTime;
    if (!paused) void media.play();
  }

  function releaseSilence(): void {
    if (silenceUrl !== null) URL.revokeObjectURL(silenceUrl);
    silenceUrl = null;
  }

  // Followed as the Preview starts, before the timeline inside it mounts: the player takes each
  // Project's media before wavesurfer.js draws over it, which takes the player's source as it is drawn
  const unfollow = feed.follow(show);

  onMount(() => {
    const listeners: [string, () => void][] = [
      ["loadedmetadata", measure],
      ["durationchange", showTime],
      ["timeupdate", follow],
      ["play", showPlaying],
      ["play", () => resumeAudioGraph(media)],
      ["pause", showPaused],
      ["error", showUnplayable],
    ];
    for (const [name, listener] of listeners)
      media.addEventListener(name, listener);
    return () => {
      unfollow();
      // Let go of the player before bringing it back, which plays it on
      for (const [name, listener] of listeners)
        media.removeEventListener(name, listener);
      if (videoWindow) closeVideoWindow();
      stopFollowingFrames();
      releaseSilence();
      screen.destroy();
    };
  });
</script>

<svelte:window
  oneditor:cursor={() => (currentIndex = session.cursor.index)}
  onrust:video-window-closing={closeVideoWindow}
/>

<div
  class="@container flex flex-col gap-3 border-b border-base-300 p-3"
  hidden={source === null || (fold.isPlayerFolded && fold.isTimelineFolded)}
>
  <div
    class="flex gap-3 data-has-picture:h-[min(30vh,calc((100cqw_-_var(--spacing)*3)*0.4*var(--picture-ratio)))] data-has-picture:min-h-40"
    hidden={fold.isPlayerFolded}
    data-has-picture={pictureRatio !== null && !isAway ? "" : undefined}
    style:--picture-ratio={pictureRatio ?? undefined}
    bind:this={screenRow}
    {@attach (row) => {
      row.prepend(screen.element);
    }}
  >
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
            class={[
              "btn btn-square btn-sm",
              playback.isFollowing && "btn-primary",
            ]}
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
            class="text-lg font-medium whitespace-nowrap tabular-nums"
            >{clock}</span
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
            <div class="ml-auto flex items-center gap-2">
              <div
                role="radiogroup"
                class="join"
                aria-label={t("preview.captionLanguage")}
              >
                {#each CAPTION_LANGUAGES as { value, label } (value)}
                  <input
                    type="radio"
                    name="preview-caption"
                    {value}
                    class="join-item btn btn-xs"
                    aria-label={t(label)}
                    checked={shownLanguage === value}
                    disabled={!hasTranslation && value !== "original"}
                    onchange={() => chooseCaptionLanguage(value)}
                  />
                {/each}
              </div>
              <div class="dropdown dropdown-end">
                <div
                  tabindex="0"
                  role="button"
                  class="btn btn-square btn-xs"
                  aria-label={t("preview.captionOptions")}
                  data-tooltip={t("preview.captionOptions")}
                >
                  <Captions class="size-4" aria-hidden="true" />
                </div>
                <div
                  tabindex="-1"
                  class="dropdown-content z-20 mt-1 w-32 bg-base-100 shadow-md"
                >
                  <!-- The join sits inside, as its display would keep a closed menu over the buttons beside it -->
                  <div
                    role="radiogroup"
                    class="join join-vertical w-full"
                    aria-label={t("preview.captionBackdrop")}
                  >
                    {#each CAPTION_BACKDROPS as { value, label } (value)}
                      <input
                        type="radio"
                        name="preview-backdrop"
                        {value}
                        class="join-item btn btn-sm"
                        aria-label={t(label)}
                        checked={captionBackdrop === value}
                        onchange={() => chooseCaptionBackdrop(value)}
                      />
                    {/each}
                  </div>
                  <p class="px-3 pt-2 text-sm">{t("preview.dummyVideo")}</p>
                  <div
                    role="radiogroup"
                    class="join w-full pt-1"
                    aria-label={t("preview.dummyVideo")}
                  >
                    {#each DUMMY_VIDEO_COLOURS as { value, label } (value)}
                      <input
                        type="radio"
                        name="preview-dummy-video"
                        {value}
                        class="join-item btn flex-1 btn-sm"
                        aria-label={t(label)}
                        checked={dummyVideoColour === value}
                        disabled={hasPicture}
                        onchange={() => chooseDummyVideoColour(value)}
                      />
                    {/each}
                  </div>
                  <label
                    class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span>{t("preview.captionSpeaker")}</span>
                    <input
                      type="checkbox"
                      class="toggle toggle-sm"
                      checked={isSpeakerShown}
                      onchange={(event) =>
                        toggleCaptionSpeaker(event.currentTarget.checked)}
                    />
                  </label>
                </div>
              </div>
            </div>
          {/if}
        </div>
        {#if !isAway}
          <div class="divider my-0"></div>
          {#if currentSegment && currentIndex !== null}
            <div class="flex min-h-0 flex-col gap-1">
              <h3 class="card-title text-sm">
                <span>{t("preview.current")}</span>
                <span class="badge badge-sm">#{currentIndex + 1}</span>
                <span
                  class="text-xs font-normal tabular-nums text-base-content/60"
                  >{formatTime(currentSegment.start_ms)} → {formatTime(
                    currentSegment.end_ms,
                  )}</span
                >
                {#if currentSegment.speaker}
                  <span class="badge badge-sm badge-neutral max-w-32 truncate"
                    >{currentSegment.speaker}</span
                  >
                {/if}
              </h3>
              <p class="line-clamp-3 text-lg whitespace-pre-line">
                {currentSegment.text}
              </p>
              <p
                class="line-clamp-2 whitespace-pre-line text-[color-mix(in_oklab,var(--color-info)_60%,var(--color-base-content))]"
              >
                {currentSegment.translation ?? ""}
              </p>
              <p class="text-xs text-base-content/60">
                <kbd class="kbd kbd-xs">{t("shortcuts.keys.space")}</kbd>
                <span
                  >{t(
                    playback.isPlayingAlone
                      ? "preview.playCurrent"
                      : "preview.playOn",
                  )}</span
                >
              </p>
              <p class="text-xs text-base-content/60">
                <kbd class="kbd kbd-xs">{keys.start}</kbd>
                <kbd class="kbd kbd-xs">{keys.end}</kbd>
                <span>{t("preview.setTimes")}</span>
              </p>
            </div>
          {:else}
            <p class="text-sm text-base-content/60">
              {t("preview.pickSegment")}
            </p>
          {/if}
        {/if}
      </div>
    </div>
  </div>
  <Timeline {playback} hidden={fold.isTimelineFolded} />
</div>
