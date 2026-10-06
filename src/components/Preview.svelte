<!--
  @component
  The Preview's player: the Current Resource's media, played whole, with the Segment being played
  over it, its controls and the Current Segment's card beside it; the timeline is a region of its
  own. The screen the media plays on is a `PreviewScreen`, which the Video Window takes out of the
  page and gives back.
-->
<script module lang="ts">
  /** The height of a Dummy Video to its width: 16:9, the shape most videos take. */
  const DUMMY_VIDEO_RATIO = 9 / 16;

  /** `text` after a Speaker Label naming `name`, as a cue names its Speaker; with nothing to say, no one is named. */
  function withSpeakerLabel(text: string, name: string | undefined): string {
    return name && text ? `${name}: ${text}` : text;
  }
</script>

<script lang="ts">
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
    type PlayedSource,
    type Silence,
    isSameSource,
    isSilenceOf,
    playedSource,
    silentWav,
  } from "#/ui/silence.ts";
  import { isShortcut } from "#/ui/shortcuts.ts";
  import { MS_PER_SECOND, formatClock } from "#/ui/time.ts";
  import { forwardKeys, openVideoWindow } from "#/ui/video-window.ts";
  import { resumeAudioGraph } from "#/ui/volume.ts";
  import { projectFeed } from "#/state/context.ts";
  import type { Playback } from "#/state/playback.svelte.ts";
  import type { PreviewFold } from "#/state/preview-fold.svelte.ts";
  import { PreviewScreen } from "#/ui/preview-screen.ts";
  import type { CaptionChoices } from "#/state/caption-choices.svelte.ts";
  import PlayerControls from "#/components/PlayerControls.svelte";

  let {
    playback,
    fold,
    choices,
  }: {
    playback: Playback;
    fold: PreviewFold;
    choices: CaptionChoices;
  } = $props();

  const feed = projectFeed();
  /** The player stays the same for as long as the page does. */
  const media = untrack(() => playback.media);
  const screen = new PreviewScreen(media);

  let project = $state.raw<ProjectView | null>(null);
  let source = $state.raw<PlayedSource | null>(null);
  /** The object URL of the silence the player reads, released once it reads something else. */
  let silenceUrl: string | null = null;
  let isPlaying = $state(false);
  /** Where the media is and how long it lasts. */
  let clock = $state("");
  /** The height the row beside the card takes for its picture at the picture's width, once measured. */
  let pictureRatio = $state<number | null>(null);
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
  const shownLanguage = $derived(choices.shownLanguage(hasTranslation));
  const isAway = $derived(videoWindow !== null);

  // Shows the caption again as its language or Speaker is chosen; each Project shows its own
  $effect(() => {
    void choices.language;
    void choices.isSpeakerShown;
    untrack(showCaptionAtTime);
  });

  // Draws the backdrop chosen over the video
  $effect(() => screen.showBackdrop(choices.backdrop));

  // Fills the screen with the colour chosen while no picture is there
  $effect(showDummyVideo);

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

  /** Sizes the row to the media just loaded, which tells only now whether it has a picture. */
  function measure(): void {
    playback.hasPicture = media.videoWidth > 0;
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
    const name = choices.isSpeakerShown ? speaker : undefined;
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
    screen.showDummyVideo(
      media.videoWidth > 0 ? null : choices.dummyVideoColour,
    );
  }

  function show(next: ProjectView | null): void {
    project = next;
    const nextSource = playedSource(next, source);
    if (isSameSource(nextSource, source)) {
      showCaptionAtTime();
      return;
    }
    const lastSource = source;
    source = nextSource;
    if (nextSource === null && videoWindow) closeVideoWindow();
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

<svelte:window onrust:video-window-closing={closeVideoWindow} />

<div
  class="@container border-b border-base-300 p-3"
  hidden={source === null || fold.isPlayerFolded}
>
  <div
    class="flex gap-3 data-has-picture:h-[min(30vh,calc((100cqw_-_var(--spacing)*3)*0.4*var(--picture-ratio)))] data-has-picture:min-h-40"
    data-has-picture={pictureRatio !== null && !isAway ? "" : undefined}
    style:--picture-ratio={pictureRatio ?? undefined}
    bind:this={screenRow}
    {@attach (row) => {
      row.prepend(screen.element);
    }}
  >
    <PlayerControls
      {playback}
      {segments}
      {clock}
      {isPlaying}
      {isAway}
      {toggleVideoWindow}
    />
  </div>
</div>
