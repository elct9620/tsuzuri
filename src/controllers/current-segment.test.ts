// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WaveSurfer from "wavesurfer.js";
import { assemble } from "../assembly";
import {
  DEFAULT_PREFERENCES,
  type ChoiceLanding,
  type ChoiceLandings,
  type Preferences,
} from "../backend/preferences";
import type { ProjectView, Segment } from "../backend/project";
import type { EditingSession } from "../editor";
import type { Waveform } from "../backend/waveform";
import { layOutTimeline } from "../test-layout";
import { projectOf } from "../test-project";
import FieldController, { composingOption } from "./field-controller";
import PreviewController from "./preview-controller";
import TimelineController, {
  controlOption,
  regionColor,
} from "./timeline-controller";
import { pageContext } from "../components/context";
import {
  drawSegmentRows,
  type DrawnSegmentRows,
  segmentRows,
} from "../components/test-segment-rows";

describe("Current Segment", () => {
  let application: Application;
  let project: ProjectView | null;
  let savedPreferences: Preferences;
  let session: EditingSession;
  /** The rows drawn, whose following playback the Preview's button turns on or off. */
  let drawn: DrawnSegmentRows | undefined;
  let takeLayoutBack: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const media = () =>
    document.querySelector<HTMLVideoElement>('[data-preview-target="media"]')!;
  const rows = segmentRows;
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
    isSpaceTaken(target);
  }

  /** Presses Space on `target`, answering whether the page took it from the browser. */
  function isSpaceTaken(target: EventTarget): boolean {
    const space = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(space);
    return space.defaultPrevented;
  }

  /**
   * Clicks `button` as a pointer does in Chromium: it takes the focus without showing it, and
   * shows it from the next key on, which happy-dom cannot tell from focus reached by keyboard.
   */
  function clickWithPointer(button: HTMLElement): void {
    let isKeyPressed = false;
    window.addEventListener("keydown", () => (isKeyPressed = true), {
      capture: true,
      once: true,
    });
    const matches = button.matches.bind(button);
    vi.spyOn(button, "matches").mockImplementation((selector) =>
      selector === ":focus-visible" ? isKeyPressed : matches(selector),
    );
    button.focus();
    button.click();
  }

  /** Opens the Speaker menu of the Segment at `index`, as focusing its button does. */
  function openSpeakers(index: number): void {
    rows()[index].querySelector<HTMLElement>(".speaker")!.focus();
  }

  const textField = (index: number) =>
    document.querySelector<HTMLElement>(
      `.field[data-index="${index}"][data-field="text"]`,
    )!;

  /** Clicks the region of the Segment at `index` at `at` seconds, on a waveform 100 pixels a second wide. */
  function clickRegion(index: number, at: number): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 }),
    );
    regions()[index].dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: at * 100 }),
    );
  }

  /** Shows `twoSegments` playing the first alone at 0.5 s. */
  async function playFirstAlone(): Promise<void> {
    await show(twoSegments);
    rows()[0].click();
    aloneButton().click();
    await media().play();
    playTo(0.5);
  }

  /** Makes the media report being at `at` seconds, as a playing player does. */
  function playTo(at: number): void {
    media().currentTime = at;
    media().dispatchEvent(new Event("timeupdate"));
  }

  const aloneButton = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-timeline-target="aloneButton"]',
    )!;

  const snapButton = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-timeline-target="snapButton"]',
    )!;

  /** The rows scrolledRows into view since `watchScrolls` began watching. */
  let scrolledRows: () => HTMLElement[];

  function watchScrolls(): void {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    scrolledRows = () => scroll.mock.contexts as HTMLElement[];
  }

  async function startApplication(): Promise<void> {
    application = Application.start();
    application.registerActionOption("control", controlOption);
    application.registerActionOption("composing", composingOption);
    const assembly = assemble(application, {
      field: FieldController,
      preview: PreviewController,
      timeline: TimelineController,
    });
    session = assembly.session;
    drawn?.unmount();
    drawn = drawSegmentRows(
      document.querySelector("main")!,
      pageContext(assembly.feed, assembly.session),
    );
    await assembly.start();
    await settle();
  }

  beforeEach(async () => {
    takeLayoutBack = layOutTimeline();
    localStorage.clear();
    project = null;
    savedPreferences = structuredClone(DEFAULT_PREFERENCES) as Preferences;
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
        if (command === "preferences") return savedPreferences;
        return null;
      },
      { shouldMockEvents: true },
    );
    document.body.innerHTML = `
      <main>
        <div data-controller="preview timeline"
          data-action="editor:cursor@window->timeline#showCursor editor:cursor@window->preview#showCursor editor:choice@window->timeline#moveToChoice preferences:saved@window->timeline#readPreferences keydown.space@window->timeline#playOrStop:!control:prevent focusin@window->timeline#followFocus">
          <button id="fold-player" data-preview-target="playerFoldButton" data-action="preview#togglePlayerFold" hidden></button>
          <button data-preview-target="timelineFoldButton" hidden></button>
          <div data-preview-target="panel">
          <div data-preview-target="screenRow">
            <div data-preview-target="screen">
              <video data-preview-target="media" data-timeline-target="media"></video>
              <p data-preview-target="caption"></p>
              <div data-preview-target="hint" hidden></div>
            </div>
          </div>
          <button id="video-window" data-preview-target="videoWindowButton" data-action="preview#toggleVideoWindow"></button>
          <span data-preview-target="playbackIcon"></span>
          <button data-timeline-target="aloneButton" data-action="timeline#togglePlayingAlone"></button>
          <span data-preview-target="time"></span>
          <input type="range" min="0" max="100" data-preview-target="volume" data-action="input->preview#setVolume"><span data-preview-target="volumeLevel"></span><button id="mute" data-preview-target="muteButton" data-action="preview#toggleMute"><span data-preview-target="muteIcon"></span></button>
          <div data-preview-target="captionChoice"><input type="radio" value="original" data-preview-target="captionLanguage"><input type="checkbox" data-preview-target="captionSpeaker"></div>
          <div data-preview-target="currentSection">
          <p data-preview-target="currentHint"></p>
          <div data-preview-target="currentCard" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><span data-preview-target="currentSpeaker" hidden></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p><span data-timeline-target="spaceHint"></span><kbd data-timeline-target="startKey"></kbd><kbd data-timeline-target="endKey"></kbd></div></div>
          <button data-timeline-target="snapButton" data-action="timeline#toggleSnapping"></button><span data-timeline-target="times"></span><span data-timeline-target="zoomLevel"></span><div data-preview-target="timeline"><div data-timeline-target="waveform"></div></div>
          </div>
        </div>
      </main>
    `;
    await startApplication();
  });

  afterEach(() => {
    drawn = undefined;
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
  it("marks the row of a region clicked in an upper Lane as the Current Segment", async () => {
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

  // @behavior PV-146
  it("gives the first region back its own look once the second is current", async () => {
    await show(twoSegments);
    rows()[0].click();

    rows()[1].click();

    expect([
      regions()[0].style.backgroundColor,
      regions()[0].style.zIndex,
    ]).toEqual([regionColor(0), ""]);
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

  // @behavior PV-192
  it("plays with Space while the player and its controls are folded", async () => {
    await show(twoSegments);
    document.querySelector<HTMLElement>("#fold-player")!.click();

    pressSpace();

    expect(media().paused).toBe(false);
  });

  // @behavior PV-031
  it("leaves Space to the field it is pressed in", async () => {
    await show(twoSegments);
    rows()[1].click();

    pressSpace(rows()[1].querySelector(".field")!);
    await settle();

    expect(media().paused).toBe(true);
  });

  // @behavior PV-125
  it("plays with Space after a button is clicked", async () => {
    await show(twoSegments);
    rows()[1].click();

    clickWithPointer(aloneButton());
    const isTaken = isSpaceTaken(aloneButton());
    await settle();

    expect([
      media().paused,
      isTaken,
      aloneButton().getAttribute("aria-pressed"),
    ]).toEqual([false, true, "true"]);
  });

  // @behavior PV-126
  it("leaves Space to a button reached by keyboard", async () => {
    await show(twoSegments);
    rows()[1].click();

    aloneButton().focus();
    const isTaken = isSpaceTaken(aloneButton());
    await settle();

    expect([media().paused, isTaken]).toEqual([true, false]);
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

  describe("telling where another Segment is chosen from", () => {
    let sources: string[];
    let listening: AbortController;

    beforeEach(() => {
      sources = [];
      listening = new AbortController();
      window.addEventListener(
        "editor:choice",
        () => sources.push(session.choiceSource),
        { signal: listening.signal },
      );
    });

    afterEach(() => listening.abort());

    /** Presses the pointer on `target` with `button`, takes it to focus as Chromium does, and clicks. */
    function press(target: HTMLElement, button = 0): void {
      target.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button }),
      );
      target.focus();
      window.dispatchEvent(new PointerEvent("pointerup", { button }));
      target.click();
    }

    const inRow = (index: number, selector: string) =>
      rows()[index].querySelector<HTMLElement>(selector)!;

    it("tells a text or a translation pressed apart from a time pressed", async () => {
      await show({ ...twoSegments, shown_translation: "en" });

      press(inRow(1, ".field.text"));
      press(inRow(0, '[data-edge="end"]'));
      press(inRow(1, ".field.translation"));
      press(inRow(0, '[data-edge="start"]'));

      expect(sources).toEqual(["text", "time", "text", "time"]);
    });

    it("takes a check, the menu or a right click as the row", async () => {
      await show(twoSegments);

      press(inRow(1, "input.check"));
      press(inRow(0, ".dropdown-left [role=button]"));
      press(inRow(1, ".field.text"), 2);

      expect(sources).toEqual(["row", "row", "row"]);
    });

    it("takes the keyboard's focus reaching a text as the row, but a Speaker menu as its own", async () => {
      await show(twoSegments);

      textField(1).focus();
      openSpeakers(0);

      expect(sources).toEqual(["row", "speaker"]);
    });

    it("forgets a press that chose nothing", async () => {
      await show(twoSegments);
      rows()[1].click();
      press(inRow(1, ".field.text"));

      textField(0).focus();

      expect(sources).toEqual(["row", "row"]);
    });
  });

  /** Saves the Preferences with `landing` for `source`, as the settings do, and waits for them to be read. */
  async function prefer(
    source: keyof ChoiceLandings,
    landing: ChoiceLanding,
  ): Promise<void> {
    savedPreferences.choice_landings[source] = landing;
    window.dispatchEvent(new CustomEvent("preferences:saved"));
    await settle();
  }

  // @behavior PV-203
  it("plays on as a text is chosen where the Preferences say so", async () => {
    await show(twoSegments);
    await prefer("text", { is_pausing: false, is_from_start: false });
    await media().play();
    playTo(0.5);

    const text = textField(1);
    text.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    text.focus();

    expect([session.cursor.index, media().paused, media().currentTime]).toEqual(
      [1, false, 0.5],
    );
  });

  // @behavior PV-204
  it("plays another Segment from its start where the Preferences say so", async () => {
    await show(twoSegments);
    await prefer("row", { is_pausing: false, is_from_start: true });
    await media().play();
    playTo(0.5);

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
  });

  // @behavior PV-205
  it("pauses where the media is where the Preferences say so", async () => {
    await show(twoSegments);
    await prefer("speaker", { is_pausing: true, is_from_start: false });
    await media().play();
    playTo(0.5);

    openSpeakers(1);

    expect([media().paused, media().currentTime]).toEqual([true, 0.5]);
  });

  // @behavior PV-206
  it("pauses where a region is clicked where the Preferences say so", async () => {
    await show(twoSegments);
    await prefer("region", { is_pausing: true, is_from_start: false });
    await media().play();
    playTo(0.5);

    clickRegion(1, 1.5);

    expect([media().paused, media().currentTime]).toEqual([true, 1.5]);
  });

  // @behavior PV-207
  it("plays alone from the start whatever the Preferences say", async () => {
    await playFirstAlone();
    await prefer("row", { is_pausing: true, is_from_start: false });

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
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
  it("plays on from where another Segment's region is clicked", async () => {
    await show(twoSegments);
    await media().play();
    playTo(0.5);

    clickRegion(1, 1.5);

    expect([media().paused, media().currentTime]).toEqual([false, 1.5]);
  });

  // @behavior PV-147
  it("plays on as another Segment's Speaker menu is opened", async () => {
    await show(twoSegments);
    await media().play();
    playTo(0.5);

    openSpeakers(1);

    expect([session.cursor.index, media().paused, media().currentTime]).toEqual(
      [1, false, 0.5],
    );
  });

  // @behavior PV-148
  it("plays on as Enter moves to the next Segment's text", async () => {
    await show(twoSegments);
    textField(0).focus();
    await media().play();
    playTo(0.5);

    textField(0).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect([session.cursor.index, media().paused, media().currentTime]).toEqual(
      [1, false, 0.5],
    );
  });

  // @behavior PV-149
  it("plays another Segment from its start when its Speaker menu is opened while playing alone", async () => {
    await playFirstAlone();

    openSpeakers(1);

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
  });

  // @behavior PV-150
  it("plays another Segment from its start when its row is chosen while playing alone", async () => {
    await playFirstAlone();

    rows()[1].click();

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
  });

  // @behavior PV-151
  it("plays another Segment from its start when its region is clicked while playing alone", async () => {
    await playFirstAlone();

    clickRegion(1, 1.5);

    expect([media().paused, media().currentTime]).toEqual([false, 1]);
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

    expect(scrolledRows()).toEqual([rows()[1]]);
  });

  // @behavior PV-120
  it("scrolls the row of the Segment started last into view", async () => {
    await show(overlappingSegments);
    await media().play();
    watchScrolls();

    playTo(1.2);

    expect(scrolledRows()).toEqual([rows()[1]]);
  });

  // @behavior PV-081
  it("marks the row being played without scrolling to it while not following playback", async () => {
    await show(twoSegments);
    drawn!.following.toggle();
    await media().play();
    watchScrolls();

    playTo(1.5);

    expect([isMarked("data-is-playing"), scrolledRows()]).toEqual([
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

    expect([drawn!.following.isOn, document.activeElement]).toEqual([
      false,
      field,
    ]);
  });

  // @behavior PV-083
  it("scrolls to the row being played as following playback is turned on", async () => {
    await show(twoSegments);
    drawn!.following.toggle();
    await media().play();
    playTo(1.5);
    watchScrolls();

    drawn!.following.toggle();
    flushSync();

    expect(scrolledRows()).toEqual([rows()[1]]);
  });

  // @behavior PV-084
  it("keeps following playback off for the next Resource", async () => {
    await show(twoSegments);
    drawn!.following.toggle();
    application.stop();
    await startApplication();

    await show({ ...twoSegments, media: "/talks/ep02.mp4" });

    expect(drawn!.following.isOn).toBe(false);
  });

  // @behavior PV-121
  it("keeps following playback as the Cursor moves in the Current Segment's field", async () => {
    await show(twoSegments);
    session.enter(0, "text", { start: 0, end: 0 }, "0");
    await media().play();
    watchScrolls();

    playTo(1.5);
    session.select(0, "text", { start: 2, end: 2 }, "0a");

    expect(scrolledRows()).toEqual([rows()[1]]);
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

  // @behavior PV-132
  it("plays on from the Current Segment with Space pressed in the Video Window", async () => {
    await show(twoSegments);
    rows()[1].click();
    const video = media();
    document.querySelector<HTMLElement>("#video-window")!.click();

    pressSpace(video);
    await settle();

    expect([video.currentTime, video.paused]).toEqual([1, false]);
    video.ownerDocument.defaultView?.close();
  });

  // @behavior PV-122
  it("pauses at the end of the Current Segment once playing alone is turned on while playing", async () => {
    await show(twoSegments);
    rows()[1].click();
    await media().play();
    playTo(1.5);

    aloneButton().click();
    playTo(2);

    expect(media().paused).toBe(true);
  });

  // @behavior PV-123
  it("plays on past the Current Segment once playing alone is turned off while playing it", async () => {
    await show(twoSegments);
    aloneButton().click();
    rows()[1].click();
    pressSpace();
    await settle();

    aloneButton().click();
    playTo(2);

    expect(media().paused).toBe(false);
  });

  // @behavior PV-124
  it("pauses at the Current Segment's new end while playing it alone", async () => {
    await show(twoSegments);
    aloneButton().click();
    rows()[1].click();
    pressSpace();
    await settle();

    await show(
      projectOf({
        ...twoSegments,
        segments: [
          segmentAt(0, 1),
          { ...segmentAt(1, 3), translation: "Today" },
        ],
      }),
    );
    playTo(2);
    const isPausedAtOldEnd = media().paused;
    playTo(3);

    expect([isPausedAtOldEnd, media().paused]).toEqual([false, true]);
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
  describe("the Waveform's height", () => {
    /** Every node Web Audio would make passes the sound on; none is heard in a test. */
    class SilentAudioContext {
      readonly destination = {};
      private node = () => ({
        gain: { value: 1 },
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 1 },
        connect: (next: unknown) => next,
      });
      createGain = this.node;
      createDynamicsCompressor = this.node;
      createMediaElementSource = this.node;
      resume = () => Promise.resolve();
    }

    let surfers: WaveSurfer[];

    /** How the last Waveform drawn is scaled: stretched to its loudest Peak, and by how much more. */
    function waveformScaling(): [boolean, number] {
      const { options } = surfers[surfers.length - 1];
      return [options.normalize ?? false, options.barHeight ?? 1];
    }

    const volumeSlider = () =>
      document.querySelector<HTMLInputElement>(
        '[data-preview-target="volume"]',
      )!;

    function moveVolumeSlider(position: number): void {
      volumeSlider().value = String(position);
      volumeSlider().dispatchEvent(new Event("input", { bubbles: true }));
    }

    beforeEach(() => {
      surfers = [];
      const create = WaveSurfer.create.bind(WaveSurfer);
      vi.spyOn(WaveSurfer, "create").mockImplementation((options) => {
        const surfer = create(options);
        surfers.push(surfer);
        return surfer;
      });
      vi.stubGlobal("AudioContext", SilentAudioContext);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // @behavior PV-184
    it("draws the Waveform to its loudest Peak", async () => {
      await show(twoSegments);

      expect(waveformScaling()).toEqual([true, 1]);
    });

    // @behavior PV-185
    it("keeps the Waveform's height as the volume changes", async () => {
      await show(twoSegments);

      moveVolumeSlider(100);

      expect(waveformScaling()).toEqual([true, 1]);
    });
  });
});
