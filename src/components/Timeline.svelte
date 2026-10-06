<!--
  @component
  The Preview's timeline: the Waveform of the Current Resource's media with a region for each
  Segment, where the Current Segment is retimed by dragging and a new one drawn on the waveform.
  wavesurfer.js draws inside the waveform's element, which the template leaves empty for it.
-->
<script module lang="ts">
  import type { UpdateSide } from "wavesurfer.js/plugins/regions";

  import { chords, type Shortcut, shortcutById } from "#/ui/shortcuts.ts";

  /** The key that sets the Current Segment's start or end where the media is, as `KeyboardEvent.key` names it. */
  export function timeKeys(isMac: boolean): Record<UpdateSide, string> {
    const key = (shortcut: Shortcut) =>
      chords(shortcut, isMac)[0].toUpperCase();
    return {
      start: key(shortcutById("setStart")),
      end: key(shortcutById("setEnd")),
    };
  }

  /**
   * The colour of the Segment at `index`, as the waveform's element defines it: neighbours take
   * turns, so where one ends and the next begins shows, and the Current Segment is stronger.
   */
  export function regionColor(index: number, isCurrent = false): string {
    if (isCurrent) return "var(--segment-current)";
    return `var(${REGION_COLORS[index % REGION_COLORS.length]})`;
  }

  const INITIAL_PX_PER_SEC = 100;
  /** The time scale's height, which the page leaves free beneath the waveform. */
  const TIMELINE_HEIGHT = 20;
  const ZOOM_FACTOR = 2;
  const MIN_PX_PER_SEC = 10;
  const MAX_PX_PER_SEC = 1600;
  /** How far the wheel turns to zoom by a factor of e; a pinch reports small steps, a mouse wheel about 100. */
  const WHEEL_ZOOM_SCALE = 200;

  const REGION_COLORS = ["--segment-even", "--segment-odd"];
  /** How near, in pixels, an edge dragged on the timeline comes to a time before it Snaps to it. */
  const SNAP_PX = 8;
  /** How far an arrow key moves the media, fine enough to set a time where it is. */
  const STEP_SECONDS = 0.1;
  /** The id of the range drawn on the waveform, which is no Segment's region. */
  const RANGE_ID = "range";
  /** How the drawn range shows: dragged by its edges or as a whole, to set it right before it is kept. */
  const RANGE_LOOK = {
    id: RANGE_ID,
    color: "var(--segment-range)",
    drag: true,
    resize: true,
  };
  /** Where the webview remembers whether a dragged edge Snaps without Shift. */
  const SNAPPING_KEY = "tsuzuri.timeline-snapping";

  const CONTROL_SELECTOR =
    "input, select, textarea, button, summary, [contenteditable], [role=button]";
</script>

<script lang="ts">
  import Magnet from "@lucide/svelte/icons/magnet";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import { onMount, untrack } from "svelte";
  import WaveSurfer from "wavesurfer.js";
  import HoverPlugin from "wavesurfer.js/plugins/hover";
  import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
  import TimelinePlugin from "wavesurfer.js/plugins/timeline";

  import { preferences } from "#/ipc/preferences.ts";
  import type { ProjectView, Segment } from "#/ipc/project.ts";
  import { isMacOS } from "#/ipc/system.ts";
  import { extractWaveform, type Waveform } from "#/ipc/waveform.ts";
  import {
    areTimesHeld,
    isTextField,
    type SegmentChange,
  } from "#/editor/index.ts";
  import { t } from "#/i18n.ts";
  import { rememberedFlag, rememberFlag } from "#/ui/choices.ts";
  import { notifyEdit, notifyFailure } from "#/state/notification.svelte.ts";
  import { isShortcut } from "#/ui/shortcuts.ts";
  import {
    type PlayedSource,
    SILENT_PEAKS,
    isSameSource,
    isSilenceOf,
    playedSource,
  } from "#/ui/silence.ts";
  import {
    choiceLanding,
    formatLength,
    formatSeconds,
    landingSpan,
    regionLanes,
    snapTime,
    spanOf,
    toMilliseconds,
    toSeconds,
    type DragReach,
    type Landing,
    type Span,
  } from "#/ui/timeline-spans.ts";
  import {
    editingSession,
    editingState,
    projectFeed,
    savedPreferences,
  } from "#/state/context.ts";
  import type { Choice } from "#/state/editing-state.svelte.ts";
  import type { Playback } from "#/state/playback.svelte.ts";

  let { playback, hidden }: { playback: Playback; hidden: boolean } = $props();

  /** A drag of the Current Segment's region under way, from its Segment's times to where it is shown. */
  interface Drag {
    index: number;
    /** The edge dragged, or none for the whole region. */
    side: UpdateSide | undefined;
    origin: Span;
    /** Where the pointer has taken the region, before it Snaps or is kept from its neighbours. */
    pointerSpan: Span;
    /** Where the region is shown now. */
    span: Span;
    /** Whether the edge it shares with the neighbour on its dragged side moves along with it. */
    isShared: boolean;
    isCancelled: boolean;
  }

  const feed = projectFeed();
  const session = editingSession();
  const editing = editingState();
  const saved = savedPreferences();
  const isMac = isMacOS();
  /** The player stays the same for as long as the page does. */
  const player = untrack(() => playback.media);

  let frame: HTMLElement;
  let waveform: HTMLElement;
  let source = $state.raw<PlayedSource | null>(null);
  let segments: Segment[] = [];
  /** Whether a running Mode holds the Current Resource, which refuses every Segment Change. */
  let isTimeHeld = false;
  let pxPerSec = $state(INITIAL_PX_PER_SEC);
  /** Whether a dragged edge Snaps, which Shift reverses for one drag; off unless chosen, as in Aegisub. */
  let isSnapping = $state(rememberedFlag(SNAPPING_KEY, false));
  /** Whether a Waveform is being taken, shown as a skeleton until it is drawn. */
  let isTakingWaveform = $state(false);
  /** The times a dragged region or a drawn range will be written with, shown only while there is one. */
  let shownSpan = $state.raw<Span | null>(null);
  let isDragging = $state(false);
  /** Where the media is and how long the Waveform runs, in seconds, which the waveform reads out as a slider. */
  let mediaTime = $state(0);
  let mediaLength = $state(0);
  /** The modifier keys held as the pointer last moved, which a region's own events do not carry. */
  let modifiers = { shiftKey: false, altKey: false };
  /** The element the focus last reached by keyboard, or none once a pointer took it. */
  let keyboardFocus: Element | null = null;
  let drag: Drag | null = null;
  /** The range drawn on the waveform, waiting for Enter to become a Segment or Esc to go. */
  let range: Region | null = null;
  /** The pointer stroke drawing a range over the Segments with the drawing key held, from the time it began at. */
  let stroke: {
    from: number;
    clientX: number;
    range: Region | null;
  } | null = null;
  let surfer: WaveSurfer | undefined;
  /** The Waveform asked for last; one that arrives after another was asked for is not drawn. */
  let waveformRequest: Promise<Waveform> | undefined;
  let regions: ReturnType<typeof RegionsPlugin.create> | undefined;
  /** The Segment whose region is drawn as the Current Segment's. */
  let drawnCurrentIndex: number | null = null;
  /**
   * Where the media was as it last reported its time, to see it play across the Current Segment's
   * end rather than jump past it; none after a seek.
   */
  let lastTime: number | null = null;

  /**
   * Whether `event` belongs to a control rather than to the timeline: the field typed in, or the
   * control reached by keyboard, which Space presses. A control clicked keeps the focus without
   * being meant for the keys that follow; the timeline tells the two apart as the focus arrives,
   * since any key pressed makes the focus visible from then on.
   */
  function isForControl(event: Event): boolean {
    const control =
      event.target instanceof Element
        ? event.target.closest(CONTROL_SELECTOR)
        : null;
    return (
      control !== null && (isTextField(control) || control === keyboardFocus)
    );
  }

  /** Takes the keys the timeline answers wherever the focus is, unless a control has it. */
  function followKeys(event: KeyboardEvent): void {
    if (isForControl(event)) return;
    if (isShortcut(event, "play", isMac)) {
      event.preventDefault();
      playOrStop();
    } else if (isShortcut(event, "cancel", isMac)) cancel();
    else if (isShortcut(event, "insertRange", isMac)) insertRange(event);
    else if (isShortcut(event, "setStart", isMac))
      setTimeAtMedia(event, "start");
    else if (isShortcut(event, "setEnd", isMac)) setTimeAtMedia(event, "end");
  }

  /** Moves the media a step with the arrow keys on the waveform, so the fields keep the keys. */
  function stepByKeys(event: KeyboardEvent): void {
    const step = isShortcut(event, "stepBack", isMac)
      ? -STEP_SECONDS
      : isShortcut(event, "stepForward", isMac)
        ? STEP_SECONDS
        : 0;
    if (step === 0) return;
    event.preventDefault();
    moveMediaBy(step);
  }

  /** Takes the Choice Landings the Preferences set; the settings tell of Preferences they cannot read. */
  async function readPreferences(): Promise<void> {
    try {
      saved.current = await preferences();
    } catch {
      // The defaults stay in use
    }
  }

  /** Paints the Waveform in the colours of the theme the system turned to. */
  function repaintWaveform(): void {
    surfer?.setOptions(waveformColors());
  }

  /**
   * Notes the modifiers held as the pointer goes down or moves anywhere; heard on the window while
   * capturing, so they are known before a region hears the same move.
   */
  function followModifiers({ shiftKey, altKey }: PointerEvent): void {
    modifiers = { shiftKey, altKey };
  }

  /** Notes whether the focus arrived by keyboard, as its showing tells before any key follows. */
  function followFocus({ target }: FocusEvent): void {
    keyboardFocus =
      target instanceof Element && target.matches(":focus-visible")
        ? target
        : null;
  }

  function zoomTo(next: number): void {
    pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, next));
    surfer?.zoom(pxPerSec);
  }

  function toggleSnapping(): void {
    isSnapping = !isSnapping;
    rememberFlag(SNAPPING_KEY, isSnapping);
  }

  /**
   * Stops the media when it plays, or else plays on from where it is, or from the Current Segment's
   * start while playing alone is turned on, for `pauseAtCurrentEnd` to stop at its end.
   */
  function playOrStop(): void {
    if (!player.paused) {
      player.pause();
      return;
    }
    if (!playback.isPlayingAlone) {
      void player.play();
      return;
    }
    const segment = currentSegment();
    if (segment) void surfer?.play(toSeconds(segment.start_ms));
  }

  /** Moves the media `seconds` on, within its length as the Waveform knows it; without a Waveform, not at all. */
  function moveMediaBy(seconds: number): void {
    const duration = surfer?.getDuration();
    if (duration === undefined) return;
    player.currentTime = Math.min(
      duration,
      Math.max(0, player.currentTime + seconds),
    );
  }

  /**
   * Moves the media to the Segment the user chose from a row, its Speaker menu or Enter, as
   * `choiceLanding` tells; a region chosen moves it from `chooseRegion`, which knows where it was clicked.
   */
  function moveToChoice({ source: choiceSource }: Choice): void {
    const segment = currentSegment();
    if (!segment || choiceSource === "region") return;
    land(
      choiceLanding({
        source: choiceSource,
        start: toSeconds(segment.start_ms),
        isPaused: player.paused,
        isPlayingAlone: playback.isPlayingAlone,
        landings: saved.current.choice_landings,
      }),
    );
  }

  /**
   * Colours the Current Segment's region, the only one that can be dragged, and draws it above the
   * rest; only the regions of the Segment current before and now change.
   */
  function showCursor(current: number | null): void {
    const drawnRegions = segmentRegions();
    const changedIndexes = new Set(
      [drawnCurrentIndex, current].filter((index) => index !== null),
    );
    for (const index of changedIndexes) {
      const region = drawnRegions[index];
      if (!region) continue;
      region.setOptions(regionLook(index));
      if (region.element)
        region.element.style.zIndex = index === current ? "1" : "";
    }
    drawnCurrentIndex = current;
  }

  // Colours each Current Segment the session tells of
  $effect(() => {
    const current = editing.cursor.index;
    untrack(() => showCursor(current));
  });

  // Moves the media to each Segment chosen, as the session tells where it was chosen from
  $effect(() => {
    const choice = editing.choice;
    if (choice) untrack(() => moveToChoice(choice));
  });

  /** Sets the Current Segment's `side` where the media is; the time stays within reach as a dragged edge does. */
  function setTimeAtMedia(event: KeyboardEvent, side: UpdateSide): void {
    const index = session.cursor.index;
    const segment = currentSegment();
    if (index === null || !segment || isTimeHeld) return;
    event.preventDefault();
    const time = player.currentTime;
    const { lowestStart, highestStart, highestEnd } = dragReach(index, false);
    const span = spanOf(segment);
    void retime(
      index,
      side === "start"
        ? {
            start: Math.min(highestStart, Math.max(lowestStart, time)),
            end: span.end,
          }
        : { start: span.start, end: Math.min(highestEnd, time) },
    );
  }

  /**
   * Begins drawing a range with the drawing key held: a press on a region otherwise chooses or
   * drags its Segment, so this goes before the regions hear it and draws over them.
   */
  function drawOver(event: PointerEvent): void {
    if (event.button !== 0 || !isDrawingKey(event) || !surfer) return;
    event.stopPropagation();
    event.preventDefault();
    if (isTimeHeld) return;
    stroke = {
      from: timeAt(event.clientX),
      clientX: event.clientX,
      range: null,
    };
  }

  /** Keeps a click with the drawing key held from choosing a Segment or moving the media. */
  function ignoreClickOver(event: MouseEvent): void {
    if (isDrawingKey(event)) event.stopPropagation();
  }

  /** Takes a drag back to where it began, or drops the drawn range. */
  function cancel(): void {
    if (drag) {
      drag.isCancelled = true;
      showSpan(drag, drag.origin);
      return;
    }
    dropRange();
  }

  /** Inserts a Segment over the drawn range with Enter. */
  function insertRange(event: KeyboardEvent): void {
    const keptRange = range;
    if (!keptRange) return;
    event.preventDefault();
    dropRange();
    void change({
      kind: "insertion",
      start_ms: toMilliseconds(keptRange.start),
      end_ms: toMilliseconds(keptRange.end),
    });
  }

  /**
   * Scrolls the timeline, or zooms it while Ctrl (Windows), Alt (as Subtitle Edit does) or ⌘ is
   * held; a trackpad pinch reports itself as Ctrl.
   */
  function scrollOrZoom(event: WheelEvent): void {
    event.preventDefault();
    if (event.ctrlKey || event.altKey || event.metaKey) {
      zoomTo(pxPerSec * Math.exp(-event.deltaY / WHEEL_ZOOM_SCALE));
      return;
    }
    surfer?.setScroll(surfer.getScroll() + event.deltaX + event.deltaY);
  }

  function show(project: ProjectView | null): void {
    segments = project?.segments ?? [];
    const view = session.transcript;
    isTimeHeld = view !== null && areTimesHeld(view);
    // A dragged region is drawn anew, so a drag cannot outlive the Segments it began on
    if (drag) regions?.clearRegions();
    drag = null;
    dropRange();
    const nextSource = playedSource(project, source);
    if (isSameSource(nextSource, source)) {
      markSegments();
      return;
    }
    const lastSource = source;
    source = nextSource;
    void loadWaveform(nextSource, lastSource);
  }

  /**
   * Draws the Waveform of a media file, taken by Rust, or a flat one over silence. Silence made
   * longer for the same Resource keeps the view where it was, as a Segment is dragged there.
   */
  async function loadWaveform(
    next: PlayedSource | null,
    lastSource: PlayedSource | null,
  ): Promise<void> {
    const isLengthened =
      next !== null &&
      !("media" in next) &&
      isSilenceOf(lastSource, next.resource);
    const scroll = surfer?.getScroll() ?? 0;
    surfer?.destroy();
    surfer = undefined;
    mediaTime = 0;
    mediaLength = 0;
    regions = undefined;
    waveformRequest = undefined;
    isTakingWaveform = false;
    if (next === null) return;
    if (!("media" in next)) {
      drawWaveform(
        SILENT_PEAKS,
        toSeconds(next.lengthMs),
        isLengthened ? scroll : 0,
      );
      return;
    }
    const { media } = next;
    isTakingWaveform = true;
    const request = extractWaveform();
    waveformRequest = request;
    try {
      const taken = await request;
      if (request === waveformRequest && taken.media === media)
        drawWaveform(taken.peaks, taken.peaks.length / taken.peaks_per_second);
    } catch (error) {
      if (request === waveformRequest)
        notifyFailure(t("preview.noWaveform"), error);
    } finally {
      if (request === waveformRequest) isTakingWaveform = false;
    }
  }

  /** Draws `peaks` spread over `duration` seconds, with a region for each Segment, scrolled to `scroll` pixels. */
  function drawWaveform(peaks: number[], duration: number, scroll = 0): void {
    const drawnRegions = RegionsPlugin.create();
    regions = drawnRegions;
    drawnRegions.on("region-clicked", (region, event) =>
      chooseRegion(region, event),
    );
    drawnRegions.on("region-update", (region, side) => {
      if (region.id !== RANGE_ID) follow(region, side);
    });
    drawnRegions.on("region-updated", (region, side) =>
      region.id === RANGE_ID ? placeRange(region, side) : letGo(),
    );
    drawnRegions.on("region-initialized", (region) => {
      if (region.id === RANGE_ID)
        region.on("update", () => showTimes(region, true));
    });
    drawnRegions.on("region-created", (region) => {
      if (region.id === RANGE_ID) keepRange(region);
    });
    surfer = WaveSurfer.create({
      container: waveform,
      media: player,
      peaks: [peaks],
      duration,
      height: "auto",
      normalize: true,
      hideScrollbar: true,
      minPxPerSec: pxPerSec,
      ...waveformColors(),
      // The cursor and the hover are elements, which follow the theme's variables themselves
      cursorColor: "var(--color-primary)",
      plugins: [
        drawnRegions,
        TimelinePlugin.create({ height: TIMELINE_HEIGHT }),
        HoverPlugin.create({
          lineColor: "var(--color-base-content)",
          labelBackground: "var(--color-neutral)",
          labelColor: "var(--color-neutral-content)",
          formatTimeCallback: formatSeconds,
        }),
      ],
    });
    surfer.on("ready", () => {
      mediaLength = surfer?.getDuration() ?? 0;
      markSegments();
      surfer?.setScroll(scroll);
    });
    surfer.on("timeupdate", (time) => {
      mediaTime = time;
      pauseAtCurrentEnd(time);
    });
    surfer.on("seeking", () => (lastTime = null));
    surfer.on("interaction", () => dropRange());
    drawnRegions.enableDragSelection(RANGE_LOOK);
  }

  /**
   * Moves the regions there are to the Segments and adds or removes only those they lack or no
   * longer need, since each region drawn anew costs a layout.
   */
  function markSegments(): void {
    const plugin = regions;
    if (!plugin) return;
    const drawnRegions = segmentRegions();
    drawnRegions.slice(segments.length).forEach((region) => region.remove());
    segments.forEach((segment, index) => {
      const span = spanOf(segment);
      const region = drawnRegions[index];
      if (!region) {
        plugin.addRegion({ ...span, ...regionLook(index) });
        return;
      }
      if (region.start !== span.start || region.end !== span.end)
        region.setOptions(span);
      region.setOptions(regionLook(index));
    });
    drawnCurrentIndex = session.cursor.index;
    placeRegions();
  }

  /**
   * Lays each region in its Lane, so overlapping Segments can each be seen, clicked and dragged,
   * with the Current Segment's above the rest; read from where the regions are, so a drag lays
   * them again as it goes.
   */
  function placeRegions(): void {
    const drawnRegions = segmentRegions();
    const lanes = regionLanes(
      drawnRegions.map(({ start, end }) => ({ start, end })),
    );
    const current = session.cursor.index;
    drawnRegions.forEach((region, index) => {
      const style = region.element?.style;
      if (!style) return;
      const lane = lanes[index];
      style.height = `${100 / lane.count}%`;
      style.top = `${((lane.count - 1 - lane.index) * 100) / lane.count}%`;
      style.zIndex = index === current ? "1" : "";
    });
  }

  /**
   * Pauses the media as it plays across the Current Segment's end while playing alone is turned on.
   * The end is read each time rather than fixed as the media starts, so turning playing alone on or
   * off, or retiming the Current Segment, takes effect on the media already playing.
   */
  function pauseAtCurrentEnd(time: number): void {
    const from = lastTime;
    lastTime = time;
    const segment = currentSegment();
    if (!playback.isPlayingAlone || !segment || from === null) return;
    const end = toSeconds(segment.end_ms);
    if (player.paused || from >= end || time < end) return;
    player.pause();
    player.currentTime = end;
  }

  function currentSegment(): Segment | undefined {
    const index = session.cursor.index;
    return index === null ? undefined : segments[index];
  }

  /**
   * Makes the Segment of a region clicked current and moves the media as `choiceLanding` tells,
   * keeping the click from the waveform, which would move it to where it was clicked regardless.
   * The Current Segment's region is left to the waveform, and a click on the drawn range is kept
   * from it too, as the waveform's click drops the range.
   */
  function chooseRegion(region: Region, event: MouseEvent): void {
    if (region.id === RANGE_ID) {
      event.stopPropagation();
      return;
    }
    const index = segmentRegions().indexOf(region);
    const segment = segments[index];
    if (!segment || index === session.cursor.index) return;
    event.stopPropagation();
    dropRange();
    const landing = choiceLanding({
      source: "region",
      start: toSeconds(segment.start_ms),
      clicked: timeAt(event.clientX),
      isPaused: player.paused,
      isPlayingAlone: playback.isPlayingAlone,
      landings: saved.current.choice_landings,
    });
    session.makeCurrent(index, "region");
    land(landing);
  }

  function land({ at, isPausing }: Landing): void {
    if (isPausing) player.pause();
    if (at !== null) player.currentTime = at;
  }

  /**
   * How the Segment at `index` shows: its colour, and whether it can be dragged, which only the
   * Current Segment can.
   */
  function regionLook(index: number) {
    const isCurrent = index === session.cursor.index;
    const isMovable = isCurrent && !isTimeHeld;
    return {
      color: regionColor(index, isCurrent),
      drag: isMovable,
      resize: isMovable,
    };
  }

  function segmentRegions(): Region[] {
    return (
      regions?.getRegions().filter((region) => region.id !== RANGE_ID) ?? []
    );
  }

  /** Follows a region as it is dragged: Snapped, kept from its neighbours and shown there. */
  function follow(region: Region, side: UpdateSide | undefined): void {
    const index = segmentRegions().indexOf(region);
    const segment = segments[index];
    if (!segment) return;
    drag ??= {
      index,
      side,
      origin: spanOf(segment),
      pointerSpan: spanOf(segment),
      span: spanOf(segment),
      isShared: false,
      isCancelled: false,
    };
    const currentDrag = drag;
    if (currentDrag.isCancelled) {
      showSpan(currentDrag, currentDrag.origin);
      return;
    }
    currentDrag.pointerSpan = {
      start:
        currentDrag.pointerSpan.start + region.start - currentDrag.span.start,
      end: currentDrag.pointerSpan.end + region.end - currentDrag.span.end,
    };
    currentDrag.isShared =
      modifiers.altKey &&
      side !== undefined &&
      sharedNeighbour(index, side) !== null;
    const reach = dragReach(index, currentDrag.isShared, side);
    const isSnappingNow = isSnapping !== modifiers.shiftKey;
    showSpan(
      currentDrag,
      landingSpan(
        currentDrag.pointerSpan,
        side,
        isSnappingNow ? reach : { ...reach, snapTimes: [] },
      ),
    );
  }

  /** Writes where a region was let go, unless the drag was taken back or ended where it began. */
  function letGo(): void {
    const endedDrag = drag;
    drag = null;
    showTimes(range);
    if (!endedDrag || endedDrag.isCancelled) return;
    const { index, side, span } = endedDrag;
    if (!endedDrag.isShared || side === undefined) {
      void retime(index, span);
      return;
    }
    const at = side === "end" ? span.end : span.start;
    if (at === endedDrag.origin[side]) return;
    void change({
      kind: "boundary",
      index: side === "end" ? index : index - 1,
      at_ms: toMilliseconds(at),
    });
  }

  /** Shows `span` for the dragged region, and for the neighbour whose edge moves with it. */
  function showSpan(currentDrag: Drag, span: Span): void {
    const drawnRegions = segmentRegions();
    drawnRegions[currentDrag.index]?.setOptions(span);
    currentDrag.span = span;
    showTimes(span, true);
    for (const side of ["start", "end"] as const) {
      const neighbour = sharedNeighbour(currentDrag.index, side);
      if (neighbour === null) continue;
      const segment = spanOf(segments[neighbour]);
      drawnRegions[neighbour]?.setOptions(
        !currentDrag.isShared || currentDrag.isCancelled
          ? segment
          : side === "end"
            ? { start: span.end, end: segment.end }
            : { start: segment.start, end: span.start },
      );
    }
    placeRegions();
  }

  /** The neighbour on `side` of the Segment at `index` whose edge touches it, or none. */
  function sharedNeighbour(index: number, side: UpdateSide): number | null {
    const segment = segments[index];
    const neighbour = side === "end" ? index + 1 : index - 1;
    const other = segments[neighbour];
    if (!segment || !other) return null;
    const isTouching =
      side === "end"
        ? other.start_ms === segment.end_ms
        : other.end_ms === segment.start_ms;
    return isTouching ? neighbour : null;
  }

  /**
   * What the Segment at `index` may reach: its start between its neighbours' starts and its end as
   * late as the media, over its neighbours; or, where the edge it shares with the next moves with
   * it, no later than that neighbour's end and the start after it. And what it Snaps to.
   */
  function dragReach(
    index: number,
    isShared: boolean,
    side?: UpdateSide,
  ): DragReach {
    const segment = spanOf(segments[index]);
    const startOf = (at: number) => {
      const other = segments[at];
      return other ? toSeconds(other.start_ms) : undefined;
    };
    const next = segments[index + 1];
    const duration = surfer?.getDuration() ?? Infinity;
    const highestEnd =
      next && isShared && side === "end"
        ? Math.min(toSeconds(next.end_ms), startOf(index + 2) ?? Infinity)
        : duration;
    return {
      lowestStart: Math.min(startOf(index - 1) ?? 0, segment.start),
      highestStart: Math.max(startOf(index + 1) ?? duration, segment.start),
      highestEnd: Math.max(highestEnd, segment.end),
      snapTimes: snapTargets(index),
      snapDistance: SNAP_PX / wrapperPxPerSec(),
    };
  }

  /** The times an edge Snaps to: where the media is, and each edge of the Segments but the one at `index`. */
  function snapTargets(index: number): number[] {
    return [
      player.currentTime,
      ...segments
        .filter((_, other) => other !== index)
        .flatMap((other) => [
          toSeconds(other.start_ms),
          toSeconds(other.end_ms),
        ]),
    ];
  }

  /** How many pixels the waveform draws a second, as the regions measure it while dragged. */
  function wrapperPxPerSec(): number {
    const width = surfer?.getWrapper().getBoundingClientRect().width ?? 0;
    const duration = surfer?.getDuration() ?? 0;
    return width > 0 && duration > 0 ? width / duration : pxPerSec;
  }

  /**
   * Keeps a range just drawn, Snapped at both ends, over any Segments it covers, since someone may
   * cut in there; one left with no length is dropped.
   */
  function keepRange(newRange: Region): void {
    if (stroke) return;
    dropRange();
    const { lowestStart, highestEnd, snapTimes, snapDistance } = rangeReach();
    const snap = (time: number) => snapTime(time, snapTimes, snapDistance);
    const start = Math.max(lowestStart, snap(newRange.start));
    const end = Math.min(highestEnd, snap(newRange.end));
    if (isTimeHeld || end <= start) {
      newRange.remove();
      return;
    }
    newRange.setOptions({ start, end });
    // Above the Current Segment's region, so its edges can be taken where it lies over one
    if (newRange.element) newRange.element.style.zIndex = "2";
    range = newRange;
    showTimes(newRange);
  }

  /** Lands the drawn range where its `side`, or the whole of it, was let go, as a dragged Segment lands. */
  function placeRange(movedRange: Region, side: UpdateSide | undefined): void {
    movedRange.setOptions(landingSpan(movedRange, side, rangeReach()));
    showTimes(movedRange);
  }

  /** What the drawn range may reach: the whole media, Snapping to every Segment's edges while snapping is on. */
  function rangeReach(): DragReach {
    const duration = surfer?.getDuration() ?? Infinity;
    const isSnappingNow = isSnapping !== modifiers.shiftKey;
    return {
      lowestStart: 0,
      highestStart: duration,
      highestEnd: duration,
      snapTimes: isSnappingNow ? snapTargets(-1) : [],
      snapDistance: SNAP_PX / wrapperPxPerSec(),
    };
  }

  /**
   * Stretches the range being drawn to the pointer, once it has moved far enough to be a drag;
   * heard on the window, as the stroke may leave the waveform.
   */
  function extendDrawing(event: PointerEvent): void {
    const currentStroke = stroke;
    if (!currentStroke || !regions) return;
    if (
      !currentStroke.range &&
      Math.abs(event.clientX - currentStroke.clientX) < 3
    )
      return;
    const to = timeAt(event.clientX);
    const span = {
      start: Math.min(currentStroke.from, to),
      end: Math.max(currentStroke.from, to),
    };
    if (currentStroke.range) currentStroke.range.setOptions(span);
    else {
      dropRange();
      currentStroke.range = regions.addRegion({ ...RANGE_LOOK, ...span });
    }
    showTimes(span, true);
  }

  /** Keeps the range a stroke drew once the pointer is let go anywhere. */
  function finishDrawing(): void {
    const strokeRange = stroke?.range;
    stroke = null;
    if (strokeRange) keepRange(strokeRange);
  }

  /** The time on the waveform under `clientX`. */
  function timeAt(clientX: number): number {
    const duration = surfer?.getDuration() ?? 0;
    const box = surfer?.getWrapper().getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const at = ((clientX - box.left) / box.width) * duration;
    return Math.min(duration, Math.max(0, at));
  }

  function dropRange(): void {
    range?.remove();
    range = null;
    showTimes(null);
  }

  /**
   * Shows the times of `span` and how long it runs, as Subtitle Edit shows a drawn range's length,
   * or none; while the pointer drags it, the time under the pointer gives way, since the times it
   * lands on may be Snapped away from it.
   */
  function showTimes(span: Span | null, isDraggingNow = false): void {
    shownSpan = span === null ? null : { start: span.start, end: span.end };
    isDragging = isDraggingNow;
  }

  /** Asks the Project for new times for the Segment at `index`, unless they are the ones it has. */
  async function retime(index: number, span: Span): Promise<void> {
    const segment = segments[index];
    const start_ms = toMilliseconds(span.start);
    const end_ms = toMilliseconds(span.end);
    if (segment.start_ms === start_ms && segment.end_ms === end_ms) return;
    await change({ kind: "times", index, start_ms, end_ms });
  }

  /** Makes `segmentChange`, putting the regions back where the Segments are when it is refused. */
  async function change(segmentChange: SegmentChange): Promise<void> {
    const outcome = await session.change(segmentChange);
    if (outcome.kind === "failed") markSegments();
    notifyEdit(outcome);
  }

  /** The colours the Waveform is painted in, from the theme shown now. */
  function waveformColors() {
    return {
      waveColor: themeColor("--color-base-content", "#888"),
      progressColor: themeColor("--color-primary", "#555"),
    };
  }

  /** A theme colour resolved to a value the canvas can paint, since a canvas cannot read CSS variables. */
  function themeColor(variable: string, fallback: string): string {
    const value = getComputedStyle(frame).getPropertyValue(variable);
    return value.trim() || fallback;
  }

  /** Whether the key the shortcut list names for drawing a range over the Segments is held. */
  function isDrawingKey(event: MouseEvent): boolean {
    const [modifier] = chords(shortcutById("drawOver"), isMac)[0].split("+");
    return modifier === "meta" ? event.metaKey : event.ctrlKey;
  }

  onMount(() => {
    const unfollow = feed.follow(show);
    void readPreferences();
    return () => {
      unfollow();
      waveformRequest = undefined;
      surfer?.destroy();
    };
  });
</script>

<svelte:window
  onsystem:color-scheme={repaintWaveform}
  onkeydown={followKeys}
  onfocusin={followFocus}
  onpointerdowncapture={followModifiers}
  onpointermovecapture={followModifiers}
  onpointermove={extendDrawing}
  onpointerup={finishDrawing}
/>

<div
  class="relative h-28 rounded-box border border-base-300 px-2 pt-2 pb-6"
  {hidden}
  bind:this={frame}
>
  <div class="absolute top-1 right-1 z-10 flex items-center gap-1">
    {#if shownSpan}
      <span class="badge badge-neutral badge-sm tabular-nums"
        >{formatSeconds(shownSpan.start)} → {formatSeconds(shownSpan.end)} ({formatLength(
          shownSpan,
        )})</span
      >
    {/if}
    <button
      type="button"
      class={["btn btn-square btn-xs", isSnapping && "btn-primary"]}
      aria-pressed={isSnapping}
      aria-label={t("preview.snapping")}
      data-tooltip={t("preview.snappingHint")}
      onclick={toggleSnapping}
    >
      <Magnet class="size-3.5" aria-hidden="true" />
    </button>
    <div class="join">
      <button
        type="button"
        class="btn btn-square btn-xs join-item"
        aria-label={t("preview.zoomOut")}
        data-tooltip={t("preview.zoomHint")}
        data-shortcut="zoom"
        onclick={() => zoomTo(pxPerSec / ZOOM_FACTOR)}
      >
        <ZoomOut class="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="btn btn-xs join-item tabular-nums"
        data-tooltip={t("preview.resetZoom")}
        onclick={() => zoomTo(INITIAL_PX_PER_SEC)}
        >{Math.round((pxPerSec / INITIAL_PX_PER_SEC) * 100)}%</button
      >
      <button
        type="button"
        class="btn btn-square btn-xs join-item"
        aria-label={t("preview.zoomIn")}
        data-tooltip={t("preview.zoomHint")}
        data-shortcut="zoom"
        onclick={() => zoomTo(pxPerSec * ZOOM_FACTOR)}
      >
        <ZoomIn class="size-3.5" aria-hidden="true" />
      </button>
    </div>
  </div>
  <div
    class={[
      "h-full [--segment-even:color-mix(in_oklab,var(--color-base-content)_6%,transparent)] [--segment-odd:color-mix(in_oklab,var(--color-base-content)_12%,transparent)] [--segment-current:color-mix(in_oklab,var(--color-primary)_25%,transparent)] [--segment-range:color-mix(in_oklab,var(--color-secondary)_25%,transparent)]",
      isTakingWaveform && "skeleton",
    ]}
    role="slider"
    aria-valuemin={0}
    aria-valuemax={mediaLength}
    aria-valuenow={mediaTime}
    aria-valuetext={formatSeconds(mediaTime)}
    aria-label={t("preview.waveform")}
    tabindex="0"
    hidden={source === null}
    data-is-dragging={isDragging ? "" : undefined}
    bind:this={waveform}
    onwheel={scrollOrZoom}
    onpointerdowncapture={drawOver}
    onclickcapture={ignoreClickOver}
    onkeydown={stepByKeys}
  ></div>
</div>
