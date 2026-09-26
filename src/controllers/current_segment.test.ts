// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView, Segment } from "../backend/project";
import type { EditingSession } from "../editor";
import type { Waveform } from "../backend/waveform";
import { layOutTimeline } from "../test_layout";
import { projectOf } from "../test_project";
import PreviewController from "./preview_controller";
import TimelineController, {
  controlOption,
  regionColor,
} from "./timeline_controller";
import TranscriptController from "./transcript_controller";

describe("Current Segment", () => {
  let application: Application;
  let project: ProjectView | null;
  let session: EditingSession;
  let takeLayoutBack: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const media = () =>
    document.querySelector<HTMLVideoElement>('[data-preview-target="media"]')!;
  const rows = () => [
    ...document.querySelectorAll<HTMLLIElement>(
      '[data-transcript-target="list"] > li',
    ),
  ];
  const regions = () => [
    ...document
      .querySelector('[data-timeline-target="waveform"]')!
      .firstElementChild!.shadowRoot!.querySelectorAll<HTMLElement>(
        '[part~="region"]',
      ),
  ];
  const segmentAt = (start: number, end: number): Segment => ({
    start_ms: start * 1000,
    end_ms: end * 1000,
    text: `${start}`,
  });
  const twoSegments = projectOf({
    media: "/talks/ep01.mp4",
    segments: [segmentAt(0, 1), { ...segmentAt(1, 2), translation: "Today" }],
  });

  /** Two Segments, the second said while the first is. */
  const overlappingSegments = projectOf({
    media: "/talks/ep01.mp4",
    segments: [segmentAt(0, 2), segmentAt(1, 1.5)],
  });

  /** `twoSegments` with the second said by `小明`. */
  const spokenSegments = projectOf({
    ...twoSegments,
    segments: [
      segmentAt(0, 1),
      { ...segmentAt(1, 2), speaker: "小明", translation: "Today" },
    ],
  });
  const currentSpeaker = () =>
    document.querySelector<HTMLElement>(
      '[data-preview-target="currentSpeaker"]',
    )!;

  /** Shows `next` and waits for the timeline to draw it: the Waveform loads, then regions are placed a turn later. */
  async function show(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    for (let turn = 0; turn < 3; turn++) await settle();
  }

  const isMarked = (attribute: string) =>
    rows().map((row) => row.hasAttribute(attribute));

  function pressSpace(target: EventTarget = document.body): void {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
  }

  /** Makes the media report being at `at` seconds, as a playing player does. */
  function playTo(at: number): void {
    media().currentTime = at;
    media().dispatchEvent(new Event("timeupdate"));
  }

  const followButton = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-transcript-target="followButton"]',
    )!;

  const aloneButton = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-timeline-target="aloneButton"]',
    )!;

  const snapButton = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-timeline-target="snapButton"]',
    )!;

  /** The rows scrolled into view since `watchScrolls` began watching. */
  let scrolled: () => HTMLElement[];

  function watchScrolls(): void {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    scrolled = () => scroll.mock.contexts as HTMLElement[];
  }

  async function startApplication(): Promise<void> {
    application = Application.start();
    application.registerActionOption("control", controlOption);
    const assembly = assemble(application, {
      transcript: TranscriptController,
      preview: PreviewController,
      timeline: TimelineController,
    });
    session = assembly.session;
    await assembly.start();
    await settle();
  }

  beforeEach(async () => {
    takeLayoutBack = layOutTimeline();
    localStorage.clear();
    project = null;
    const waveform: Waveform = {
      media: "/talks/ep01.mp4",
      peaks_per_second: 100,
      peaks: new Array(200).fill(0.5),
    };
    mockConvertFileSrc("macos");
    mockIPC(
      (command) => {
        if (command === "current_project") return project;
        if (command === "extract_waveform") return waveform;
        return null;
      },
      { shouldMockEvents: true },
    );
    document.body.innerHTML = `
      <main data-controller="transcript"
        data-action="editor:cursor@window->transcript#showCursor preview:playing->transcript#markPlaying keydown.ctrl+l@window->transcript#toggleFollowing:prevent">
        <div data-controller="preview timeline"
          data-action="editor:cursor@window->timeline#showCursor editor:cursor@window->preview#showCursor editor:choice@window->timeline#pauseAtCurrent keydown.space@window->timeline#playOrStop:!control:prevent">
          <button data-preview-target="foldButton" hidden><span data-preview-target="foldIcon"></span></button>
          <div data-preview-target="panel">
          <div data-preview-target="screen">
            <video data-preview-target="media" data-timeline-target="media" data-action="timeupdate->preview#follow pause->preview#showPaused"></video>
            <p data-preview-target="caption"></p>
            <div data-preview-target="hint" hidden></div>
          </div>
          <span data-preview-target="playbackIcon"></span>
          <button data-transcript-target="followButton" data-action="transcript#toggleFollowing"></button>
          <button data-timeline-target="aloneButton" data-action="timeline#togglePlayingAlone"></button>
          <span data-preview-target="time"></span>
          <div data-preview-target="captionChoice"><input type="radio" value="original" data-preview-target="captionLanguage"><input type="checkbox" data-preview-target="captionSpeaker"></div>
          <p data-preview-target="currentHint"></p>
          <div data-preview-target="currentCard" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><span data-preview-target="currentSpeaker" hidden></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p><span data-timeline-target="spaceHint"></span><kbd data-timeline-target="startKey"></kbd><kbd data-timeline-target="endKey"></kbd></div>
          <button data-timeline-target="snapButton" data-action="timeline#toggleSnapping"></button><span data-timeline-target="times"></span><span data-timeline-target="zoomLevel"></span><div data-timeline-target="waveform"></div>
          </div>
        </div>
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <ol data-transcript-target="list"></ol>
      </main>
    `;
    await startApplication();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.restoreAllMocks();
    takeLayoutBack();
  });

  // @behavior PV-025
  it("marks the clicked row alone as the Current Segment", async () => {
    await show(twoSegments);

    rows()[1].click();

    expect(isMarked("aria-current")).toEqual([false, true]);
  });

  // @behavior PV-026
  it("marks the row of the clicked region as the Current Segment", async () => {
    await show(twoSegments);

    regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(isMarked("aria-current")).toEqual([false, true]);
  });

  // @behavior PV-109
  it("marks the row of a region clicked in an upper lane as the Current Segment", async () => {
    await show(overlappingSegments);
    rows()[0].click();

    regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(isMarked("aria-current")).toEqual([false, true]);
  });

  // @behavior PV-110
  it("draws the Current Segment's region above the others", async () => {
    await show(twoSegments);

    rows()[0].click();

    expect(regions().map((region) => region.style.zIndex)).toEqual(["1", ""]);
  });

  // @behavior PV-027
  it("colours the Current Segment's region more strongly", async () => {
    await show(twoSegments);

    rows()[1].click();

    expect(regions().map((region) => region.style.backgroundColor)).toEqual([
      regionColor(0),
      regionColor(1, true),
    ]);
  });

  // @behavior PV-028
  it("plays the Current Segment from its start with Space while playing alone", async () => {
    await show(twoSegments);
    aloneButton().click();
    rows()[1].click();
    playTo(1.5);

    pressSpace();
    await settle();

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
  });

  // @behavior PV-029
  it("pauses at the end of the Current Segment while playing alone", async () => {
    await show(twoSegments);
    aloneButton().click();
    rows()[1].click();
    pressSpace();
    await settle();

    playTo(2);

    expect(media().paused).toBe(true);
  });

  // @behavior PV-030
  it("pauses the playing media with Space", async () => {
    await show(twoSegments);
    await media().play();

    pressSpace();

    expect(media().paused).toBe(true);
  });

  // @behavior PV-031
  it("leaves Space to the field it is pressed in", async () => {
    await show(twoSegments);
    rows()[1].click();

    pressSpace(rows()[1].querySelector(".field")!);
    await settle();

    expect(media().paused).toBe(true);
  });

  // @behavior PV-032
  it("marks the row of the Segment being played", async () => {
    await show(twoSegments);
    await media().play();

    playTo(1.5);

    expect(isMarked("data-is-playing")).toEqual([false, true]);
  });

  // @behavior PV-111
  it("marks the row of every Segment being played", async () => {
    await show(overlappingSegments);
    await media().play();

    playTo(1.2);

    expect(isMarked("data-is-playing")).toEqual([true, true]);
  });

  // @behavior PV-075
  it("pauses at the start of a Segment whose row is chosen while the media plays", async () => {
    await show(twoSegments);
    await media().play();
    playTo(0.5);

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([true, 1]);
  });

  // @behavior PV-076
  it("moves the paused media to the start of a Segment whose row is chosen", async () => {
    await show(twoSegments);
    playTo(0.5);

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([true, 1]);
  });

  // @behavior PV-077
  it("pauses where a Segment's region is clicked while the media plays", async () => {
    // The waveform takes a click's time from its width: 200 pixels over two seconds of Peaks
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 }),
    );
    await show(twoSegments);
    // The waveform moves only media ready to play there, which happy-dom never is
    Object.defineProperty(media(), "readyState", {
      value: HTMLMediaElement.HAVE_ENOUGH_DATA,
    });
    await media().play();
    playTo(0.5);

    regions()[1].dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 150 }),
    );

    expect([media().paused, media().currentTime]).toEqual([true, 1.5]);
  });

  // @behavior PV-078
  it("plays on when the Current Segment's row is clicked", async () => {
    await show(twoSegments);
    rows()[1].click();
    await media().play();
    playTo(1.5);

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([false, 1.5]);
  });

  // @behavior PV-079
  it("plays on when a Segment Change moves the Current Segment", async () => {
    await show(twoSegments);
    rows()[0].click();
    await media().play();
    playTo(0.5);

    await session.change({ kind: "insertion-after", index: 0 });
    await show({
      ...twoSegments,
      segments: [segmentAt(0, 1), segmentAt(1, 1), segmentAt(1, 2)],
    });

    expect([session.cursor.index, media().paused]).toEqual([1, false]);
  });

  // @behavior PV-036
  it("shows the Current Segment's number, times, text and translation beside the video", async () => {
    await show(twoSegments);

    rows()[1].click();

    expect(
      [
        "currentNumber",
        "currentTimes",
        "currentText",
        "currentTranslation",
      ].map(
        (name) =>
          document.querySelector(`[data-preview-target="${name}"]`)!
            .textContent,
      ),
    ).toEqual(["#2", "00:00:01.000 → 00:00:02.000", "1", "Today"]);
  });

  // @behavior PV-097
  it("names the Current Segment's Speaker beside the video", async () => {
    await show(spokenSegments);

    rows()[1].click();

    expect([currentSpeaker().hidden, currentSpeaker().textContent]).toEqual([
      false,
      "小明",
    ]);
  });

  // @behavior PV-098
  it("names no one beside the video for a Segment without a Speaker", async () => {
    await show(spokenSegments);
    rows()[1].click();

    rows()[0].click();

    expect(currentSpeaker().hidden).toBe(true);
  });

  // @behavior PV-037
  it("follows an edit of the Current Segment beside the video", async () => {
    await show(twoSegments);
    rows()[1].click();

    await show({
      ...twoSegments,
      segments: [segmentAt(0, 1), { ...segmentAt(1, 2), text: "明天" }],
    });

    expect(
      document.querySelector('[data-preview-target="currentText"]')!
        .textContent,
    ).toBe("明天");
  });

  // @behavior PV-038
  it("clears the playing mark when the media pauses", async () => {
    await show(twoSegments);
    await media().play();
    playTo(1.5);

    media().pause();

    expect(isMarked("data-is-playing")).toEqual([false, false]);
  });

  // @behavior PV-039
  it("leaves the next row unmarked when a Segment played alone ends", async () => {
    await show(twoSegments);

    playTo(1);

    expect(isMarked("data-is-playing")).toEqual([false, false]);
  });

  // @behavior PV-080
  it("scrolls the row being played into view by default", async () => {
    await show(twoSegments);
    await media().play();
    watchScrolls();

    playTo(1.5);

    expect(scrolled()).toEqual([rows()[1]]);
  });

  // @behavior PV-120
  it("scrolls the row of the Segment started last into view", async () => {
    await show(overlappingSegments);
    await media().play();
    watchScrolls();

    playTo(1.2);

    expect(scrolled()).toEqual([rows()[1]]);
  });

  // @behavior PV-081
  it("marks the row being played without scrolling to it while not following playback", async () => {
    await show(twoSegments);
    followButton().click();
    await media().play();
    watchScrolls();

    playTo(1.5);

    expect([isMarked("data-is-playing"), scrolled()]).toEqual([
      [false, true],
      [],
    ]);
  });

  // @behavior PV-082
  it("turns following playback off with Ctrl+L, leaving the focus in the field", async () => {
    await show(twoSegments);
    const field = rows()[1].querySelector<HTMLElement>(".field")!;
    field.focus();
    await media().play();

    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "l", ctrlKey: true, bubbles: true }),
    );

    expect([
      followButton().getAttribute("aria-pressed"),
      document.activeElement,
    ]).toEqual(["false", field]);
  });

  // @behavior PV-083
  it("scrolls to the row being played as following playback is turned on", async () => {
    await show(twoSegments);
    followButton().click();
    await media().play();
    playTo(1.5);
    watchScrolls();

    followButton().click();

    expect(scrolled()).toEqual([rows()[1]]);
  });

  // @behavior PV-084
  it("keeps following playback off for the next Resource", async () => {
    await show(twoSegments);
    followButton().click();
    application.stop();
    await startApplication();

    await show({ ...twoSegments, media: "/talks/ep02.mp4" });

    expect(followButton().getAttribute("aria-pressed")).toBe("false");
  });

  // @behavior PV-085
  it("plays on from the Current Segment past its end with Space by default", async () => {
    await show(twoSegments);
    rows()[1].click();
    pressSpace();
    await settle();
    const startedAt = media().currentTime;

    playTo(2);

    expect([startedAt, media().paused]).toEqual([1, false]);
  });

  // @behavior PV-086
  it("plays on from where the media paused with Space", async () => {
    await show(twoSegments);
    rows()[1].click();
    playTo(1.5);

    pressSpace();
    await settle();

    expect([media().paused, media().currentTime]).toEqual([false, 1.5]);
  });

  // @behavior PV-087
  it("keeps playing alone on for the next Resource", async () => {
    await show(twoSegments);
    aloneButton().click();
    application.stop();
    await startApplication();

    await show({ ...twoSegments, media: "/talks/ep02.mp4" });

    expect(aloneButton().getAttribute("aria-pressed")).toBe("true");
  });

  // @behavior PV-101
  it("keeps snapping on for the next Resource", async () => {
    await show(twoSegments);
    snapButton().click();
    application.stop();
    await startApplication();

    await show({ ...twoSegments, media: "/talks/ep02.mp4" });

    expect(snapButton().getAttribute("aria-pressed")).toBe("true");
  });
});
