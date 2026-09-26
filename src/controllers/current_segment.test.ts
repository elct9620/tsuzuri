// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView, Segment } from "../backend/project";
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

  beforeEach(async () => {
    takeLayoutBack = layOutTimeline();
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
        data-action="editor:cursor@window->transcript#showCursor preview:playing->transcript#markPlaying">
        <div data-controller="preview timeline"
          data-action="editor:cursor@window->timeline#showCursor editor:cursor@window->preview#showCursor keydown.space@window->timeline#playCurrent:!control:prevent">
          <button data-preview-target="fold" hidden><span data-preview-target="foldIcon"></span></button>
          <div data-preview-target="panel">
          <div data-preview-target="screen">
            <video data-preview-target="media" data-timeline-target="media" data-action="timeupdate->preview#follow pause->preview#showPaused"></video>
            <p data-preview-target="caption"></p>
            <div data-preview-target="hint" hidden></div>
          </div>
          <span data-preview-target="playback"></span>
          <span data-preview-target="time"></span>
          <div data-preview-target="captionChoice"><input type="radio" value="original" data-preview-target="captionLanguage"></div>
          <p data-preview-target="currentEmpty"></p>
          <div data-preview-target="current" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p></div>
          <button data-timeline-target="snapping"></button><span data-timeline-target="times"></span><span data-timeline-target="zoomLevel"></span><div data-timeline-target="waveform"></div>
          </div>
        </div>
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="empty"></p>
        <ol data-transcript-target="list"></ol>
      </main>
    `;
    application = Application.start();
    application.registerActionOption("control", controlOption);
    await assemble(application, {
      transcript: TranscriptController,
      preview: PreviewController,
      timeline: TimelineController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
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
  it("plays the Current Segment from its start with Space", async () => {
    await show(twoSegments);
    rows()[1].click();

    pressSpace();
    await settle();

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
  });

  // @behavior PV-029
  it("pauses at the end of the Current Segment", async () => {
    await show(twoSegments);
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

    expect(isMarked("data-playing")).toEqual([false, true]);
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

    expect(isMarked("data-playing")).toEqual([false, false]);
  });

  // @behavior PV-039
  it("leaves the next row unmarked when a Segment played alone ends", async () => {
    await show(twoSegments);

    playTo(1);

    expect(isMarked("data-playing")).toEqual([false, false]);
  });
});
