// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WaveSurfer from "wavesurfer.js";
import { assemble } from "../assembly";
import { DEFAULT_PREFERENCES } from "../backend/preferences";
import type { EditingSession } from "../editor";
import type { SegmentChange } from "../backend/editing";
import type { ProjectView, Segment } from "../backend/project";
import type { Waveform } from "../backend/waveform";
import { setInterfaceLanguage, t } from "../i18n";
import { layOutTimeline } from "../test-layout";
import { projectOf } from "../test-project";
import { pageContext } from "./context";
import { Playback } from "./playback.svelte";
import {
  showNotifications,
  notificationDetail,
  notifications,
} from "./test-notifications";
import Timeline, { regionColor } from "./Timeline.svelte";

describe("Timeline", () => {
  /** What the timeline plays, shared with the Preview. */
  let playback: Playback;
  const media = () => playback.media;
  let session: EditingSession;
  let project: ProjectView | null;
  let waveform: Waveform;
  /** How `extract_waveform` answers; the Waveform at once unless a test holds it back. */
  let takeWaveform: () => Waveform | Promise<Waveform>;
  let changes: SegmentChange[];
  /** Tells the page the system turned light or dark, as a colour scheme media query does. */
  let turnColorScheme: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /**
   * How long wavesurfer.js keeps swallowing clicks on the document once a drag ends, so the press
   * that ended it does not click; its draggable lifts the guard on a 10 ms timer.
   */
  const CLICK_GUARD_MS = 10;
  /** The timeline's frame, holding its tools and the Waveform. */
  let frame: () => HTMLElement;
  /** The element wavesurfer.js draws the Waveform in, found while it is hidden too. */
  const waveformOf = () =>
    frame().querySelector<HTMLElement>('[role="slider"]')!;
  const host = () => waveformOf().firstElementChild!.shadowRoot!;
  const wrapper = () => host().querySelector<HTMLElement>(".wrapper")!;
  const regions = () => [
    ...host().querySelectorAll<HTMLElement>('[part~="region"]'),
  ];
  /** Where each region lies and how tall it is, as the share of the waveform's height. */
  const lanes = () =>
    regions().map((region) => [region.style.top, region.style.height]);
  const segmentAt = (start: number, end: number): Segment => ({
    start_ms: start * 1000,
    end_ms: end * 1000,
    text: "",
  });
  const projectWithMedia = (segments: Segment[] = []) =>
    projectOf({ media: "/talks/ep01.mp4", segments });

  /** Shows `next` and waits for the timeline to draw it: the Waveform loads, then regions are placed a turn later. */
  async function show(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    for (let turn = 0; turn < 3; turn++) await settle();
  }

  /** Presses the button labelled by the key `label`. */
  function press(label: string): void {
    screen.getByRole("button", { name: t(label) }).click();
    flushSync();
  }

  /** The button reading the zoom level, which goes back to where it started when pressed. */
  const zoomLevel = () => screen.getByRole("button", { name: /^\d+%$/ });

  /** Draws the timeline beside a text field, as the page draws it beside the editor. */
  async function drawTimeline(): Promise<void> {
    const assembly = assemble();
    session = assembly.session;
    playback = new Playback();
    const { container } = render(Timeline, {
      props: { playback, hidden: false },
      context: pageContext(assembly.feed, assembly.session),
    });
    frame = () => container.firstElementChild as HTMLElement;
    await assembly.start();
    await settle();
  }

  let takeLayoutBack: () => void;

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    takeLayoutBack = layOutTimeline();
    localStorage.clear();
    // The regions measure a drag against their own width: 200 pixels over two seconds of Peaks
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 }),
    );
    const schemeListeners: (() => void)[] = [];
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          media: query,
          matches: false,
          addEventListener: (_: string, listener: () => void) =>
            schemeListeners.push(listener),
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    turnColorScheme = () => schemeListeners.forEach((listener) => listener());
    project = null;
    changes = [];
    takeWaveform = () => waveform;
    waveform = {
      media: "/talks/ep01.mp4",
      peaks_per_second: 100,
      peaks: Array.from({ length: 200 }, (_, index) => (index % 10) / 10),
    };
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "preferences") return DEFAULT_PREFERENCES;
        if (command === "extract_waveform") return takeWaveform();
        if (command === "change_segments")
          changes.push((args as { change: SegmentChange }).change);
        return null;
      },
      { shouldMockEvents: true },
    );
    document.body.innerHTML = `<input id="typing" />`;
    showNotifications();
    await drawTimeline();
  });

  afterEach(async () => {
    cleanup();
    clearMocks();
    vi.restoreAllMocks();
    takeLayoutBack();
    // The document outlives each test, so a drag's guard would swallow the next test's first click
    await new Promise((resolve) => setTimeout(resolve, CLICK_GUARD_MS));
  });

  // @behavior PV-017
  it("draws the Waveform over the time its Peaks cover", async () => {
    await show(projectWithMedia());

    expect(wrapper().style.width).toBe("200px");
  });

  // @behavior PV-198
  it("draws a flat Waveform over the silence of a Resource without media", async () => {
    let takenWaveforms = 0;
    takeWaveform = () => {
      takenWaveforms += 1;
      return waveform;
    };

    await show(projectOf({ media: null, segments: [segmentAt(2, 10)] }));

    expect([wrapper().style.width, takenWaveforms]).toEqual(["7000px", 0]);
  });

  it("draws the flat Waveform anew as the silence lengthens", async () => {
    await show(projectOf({ media: null, segments: [segmentAt(2, 10)] }));

    await show(projectOf({ media: null, segments: [segmentAt(2, 70)] }));

    expect(wrapper().style.width).toBe("13000px");
  });

  // @behavior PV-202
  it("keeps the timeline scrolled where it was as the silence lengthens", async () => {
    await show(projectOf({ media: null, segments: [segmentAt(2, 10)] }));
    host().querySelector<HTMLElement>(".scroll")!.scrollLeft = 5000;

    await show(projectOf({ media: null, segments: [segmentAt(2, 70)] }));

    expect(host().querySelector<HTMLElement>(".scroll")!.scrollLeft).toBe(5000);
  });

  // @behavior PV-152
  it("draws the Waveform in the colours of the theme turned to", async () => {
    const timeline = frame();
    timeline.style.setProperty("--color-base-content", "#111111");
    await show(projectWithMedia());
    const paint = vi.spyOn(WaveSurfer.prototype, "setOptions");

    timeline.style.setProperty("--color-base-content", "#eeeeee");
    turnColorScheme();

    expect(paint).toHaveBeenCalledWith(
      expect.objectContaining({ waveColor: "#eeeeee" }),
    );
  });

  // @behavior PV-018
  it("does not draw a Waveform of media no longer current", async () => {
    waveform = { ...waveform, media: "/talks/ep01.mp4" };

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(waveformOf().childElementCount).toBe(0);
  });

  // @behavior PV-141
  it("draws one Waveform when the media comes back before the first arrives", async () => {
    const heldAnswers: ((waveform: Waveform) => void)[] = [];
    takeWaveform = () => new Promise((resolve) => heldAnswers.push(resolve));
    await show(projectOf({ media: "/talks/ep01.mp4" }));
    await show(projectOf({ media: "/talks/ep02.mp4" }));
    await show(projectOf({ media: "/talks/ep01.mp4" }));

    for (const [index, media] of ["ep01", "ep02", "ep01"].entries())
      heldAnswers[index]({ ...waveform, media: `/talks/${media}.mp4` });
    for (let turn = 0; turn < 3; turn++) await settle();

    expect(waveformOf().childElementCount).toBe(1);
  });

  // @behavior PV-142
  it("stays quiet about a Waveform no longer asked for", async () => {
    let failTaking: (error: unknown) => void = () => {};
    takeWaveform = () =>
      new Promise((_, reject) => {
        failTaking = reject;
      });
    await show(projectOf({ media: "/talks/ep01.mp4" }));
    await show(projectOf({ media: null }));

    failTaking({ code: "no-media" });
    for (let turn = 0; turn < 3; turn++) await settle();

    expect(notifications()).toEqual([]);
  });

  // @behavior PV-143
  it("names the step that failed to take a Waveform", async () => {
    takeWaveform = () =>
      Promise.reject({
        code: "step-failed",
        step: "waveform",
        detail: "Invalid data",
      });

    await show(projectWithMedia());

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["無法畫出波形"],
      "擷取波形 失敗：Invalid data",
    ]);
  });

  // @behavior PV-019
  it("marks each Segment as a region spanning its own times", async () => {
    await show(
      projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1), segmentAt(1, 2)]),
    );

    expect(
      regions().map((region) => [region.style.left, region.style.right]),
    ).toEqual([
      ["0%", "75%"],
      ["25%", "50%"],
      ["50%", "0%"],
    ]);
  });

  // @behavior PV-024
  it("colours neighbouring Segments differently", () => {
    const colors = [0, 1, 2].map((index) => regionColor(index));

    expect([colors[0] === colors[2], colors[0] === colors[1]]).toEqual([
      true,
      false,
    ]);
  });

  // @behavior PV-107
  it("lays overlapping Segments in Lanes, the first in the lower one", async () => {
    await show(projectWithMedia([segmentAt(0, 2), segmentAt(1, 1.5)]));

    expect(lanes()).toEqual([
      ["50%", "50%"],
      ["0%", "50%"],
    ]);
  });

  // @behavior PV-108
  it("keeps a Segment that overlaps none at full height", async () => {
    await show(
      projectWithMedia([segmentAt(0, 1), segmentAt(0.5, 0.8), segmentAt(1, 2)]),
    );

    expect(lanes()[2]).toEqual(["0%", "100%"]);
  });

  // @behavior PV-020
  it("follows an added Segment at the same zoom", async () => {
    await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1)]));
    press("preview.zoomIn");

    await show(
      projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1), segmentAt(1, 2)]),
    );

    expect([regions().length, wrapper().style.width]).toEqual([3, "400px"]);
  });

  // @behavior PV-144
  it("keeps the regions already drawn when a Segment is split", async () => {
    await show(projectWithMedia([segmentAt(0, 1), segmentAt(1, 2)]));
    const drawnRegions = regions();

    await show(
      projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1), segmentAt(1, 2)]),
    );

    expect([
      regions().length,
      drawnRegions.every((region) => regions().includes(region)),
    ]).toEqual([3, true]);
  });

  // @behavior PV-021
  it("doubles the pixels a second when zooming in", async () => {
    await show(projectWithMedia());

    press("preview.zoomIn");

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-022
  it("halves the pixels a second when zooming out", async () => {
    await show(projectWithMedia());

    press("preview.zoomOut");

    expect(wrapper().style.width).toBe("100px");
  });

  // @behavior PV-023
  it("scrolls later as the wheel turns down", async () => {
    await show(projectWithMedia());
    const scroller = host().querySelector<HTMLElement>(".scroll")!;

    waveformOf().dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));

    expect(scroller.scrollLeft).toBe(120);
  });

  // @behavior PV-033
  it("zooms in as the wheel turns up with Ctrl held", async () => {
    await show(projectWithMedia());
    const pinch = new WheelEvent("wheel", { deltaY: -200 * Math.log(2) });
    // happy-dom's WheelEvent is not a MouseEvent, so it keeps no modifier keys.
    Object.defineProperty(pinch, "ctrlKey", { value: true });

    waveformOf().dispatchEvent(pinch);

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-040
  it("zooms in as the wheel turns up with Alt held", async () => {
    await show(projectWithMedia());
    const turn = new WheelEvent("wheel", { deltaY: -200 * Math.log(2) });
    // happy-dom's WheelEvent is not a MouseEvent, so it keeps no modifier keys.
    Object.defineProperty(turn, "altKey", { value: true });

    waveformOf().dispatchEvent(turn);

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-188
  it("zooms in as the wheel turns up with ⌘ held", async () => {
    await show(projectWithMedia());
    const turn = new WheelEvent("wheel", { deltaY: -200 * Math.log(2) });
    // happy-dom's WheelEvent is not a MouseEvent, so it keeps no modifier keys.
    Object.defineProperty(turn, "metaKey", { value: true });

    waveformOf().dispatchEvent(turn);

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-041
  it("reads the zoom level as a percentage of where it starts", async () => {
    await show(projectWithMedia());

    press("preview.zoomIn");

    expect(zoomLevel().textContent).toBe("200%");
  });

  // @behavior PV-042
  it("goes back to where it started when the zoom level is pressed", async () => {
    await show(projectWithMedia());
    press("preview.zoomIn");

    zoomLevel().click();

    expect(wrapper().style.width).toBe("200px");
  });
  /** The times a dragged region or a drawn range will be written with, or none while there is neither. */
  function spanTimes(): string | null {
    flushSync();
    return frame().querySelector(".badge")?.textContent ?? null;
  }

  // @behavior PV-071
  it("reads the time under the pointer", async () => {
    await show(projectWithMedia());

    wrapper().dispatchEvent(
      new PointerEvent("pointermove", { clientX: 150, bubbles: true }),
    );

    expect(host().querySelector('[part="hover-label"]')!.textContent).toBe(
      "00:00:01.500",
    );
  });

  describe("retiming", () => {
    /** Shows `segments` and makes the one at `current` the Current Segment, as a click on its row does. */
    async function showCurrent(
      segments: Segment[],
      current = 0,
      changes: Partial<ProjectView> = {},
    ): Promise<void> {
      await show({ ...projectWithMedia(segments), ...changes });
      session.makeCurrent(current);
    }

    const endOf = (index: number) =>
      regions()[index].querySelector<HTMLElement>(
        '[part~="region-handle-right"]',
      );
    const startOf = (index: number) =>
      regions()[index].querySelector<HTMLElement>(
        '[part~="region-handle-left"]',
      );

    /** Presses the pointer on `element`, then moves it `by` pixels and back `back` more, with `keys` held. */
    function pressAndMove(
      element: Element,
      by: number,
      keys: PointerEventInit = {},
      back = 0,
    ): void {
      const at = {
        pointerId: 1,
        button: 0,
        bubbles: true,
        cancelable: true,
        ...keys,
      };
      element.dispatchEvent(
        new PointerEvent("pointerdown", { ...at, clientX: 100 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...at, clientX: 100 + by }),
      );
      if (back !== 0)
        window.dispatchEvent(
          new PointerEvent("pointermove", { ...at, clientX: 100 + by + back }),
        );
    }

    function letGo(): void {
      window.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 1, button: 0 }),
      );
    }

    // A pointer a test leaves pressed would hold every later drag
    afterEach(letGo);

    async function drag(
      element: Element,
      by: number,
      keys: PointerEventInit = {},
    ): Promise<void> {
      pressAndMove(element, by, keys);
      letGo();
      await settle();
    }

    /** Draws from `from` pixels across `by` more, pressing on `element` with `keys` held. */
    async function drawOver(
      element: Element,
      from: number,
      by: number,
      keys: PointerEventInit = {},
    ): Promise<void> {
      const at = {
        pointerId: 1,
        button: 0,
        bubbles: true,
        cancelable: true,
        composed: true,
        ...keys,
      };
      element.dispatchEvent(
        new PointerEvent("pointerdown", { ...at, clientX: from }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...at, clientX: from + by }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", { ...at, clientX: from + by }),
      );
      element.dispatchEvent(
        new MouseEvent("click", { ...at, clientX: from + by }),
      );
      await settle();
    }

    /** Draws a range on the empty waveform from `from` pixels across `by` more; it begins five pixels wide. */
    async function draw(from: number, by: number): Promise<void> {
      const at = { pointerId: 1, button: 0, bubbles: true, cancelable: true };
      wrapper().dispatchEvent(
        new PointerEvent("pointerdown", { ...at, clientX: from }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...at, clientX: from + by }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", { ...at, clientX: from + by }),
      );
      await settle();
    }

    function pressKey(key: string): void {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    }

    const times = (index: number, start_ms: number, end_ms: number) => ({
      kind: "times",
      index,
      start_ms,
      end_ms,
    });

    // @behavior PV-050
    it("asks for the times the Current Segment's end is dragged to", async () => {
      await showCurrent([segmentAt(0, 0.5)]);

      await drag(endOf(0)!, 20);

      expect(changes).toEqual([times(0, 0, 700)]);
    });

    // @behavior PV-145
    it("draws a dragged region anew when the Segments change under it", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.5, 1)]);
      const dragged = regions()[0];
      pressAndMove(dragged, 20);

      await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1)]));

      expect([
        regions().includes(dragged),
        regions()[0].style.left,
        regions()[0].style.right,
      ]).toEqual([false, "0%", "75%"]);
    });

    // @behavior PV-051
    it("moves the Current Segment as a whole when its body is dragged", async () => {
      await showCurrent([segmentAt(0.5, 1)]);

      await drag(regions()[0], 20);

      expect(changes).toEqual([times(0, 700, 1200)]);
    });

    // @behavior PV-052
    it("leaves a Segment other than the Current Segment where it is", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.5, 1)]);

      await drag(regions()[1], 20);

      expect(changes).toEqual([]);
    });

    // @behavior PV-053
    it("overlaps the next Segment with a dragged end", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1.5)]);

      await drag(endOf(0)!, 50);

      expect(changes).toEqual([times(0, 0, 1000)]);
    });

    // @behavior PV-112
    it("stops a dragged start at the previous Segment's start", async () => {
      await showCurrent([segmentAt(0.5, 1), segmentAt(1, 1.5)], 1);

      await drag(startOf(1)!, -80);

      expect(changes).toEqual([times(1, 500, 1500)]);
    });

    // @behavior PV-113
    it("stops a moved Segment at the next Segment's start", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1.2)]);

      await drag(regions()[0], 100);

      expect(changes).toEqual([times(0, 600, 1100)]);
    });

    // @behavior PV-114
    it("lays a dragged Segment in a Lane as it overlaps the next", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1.2)]);

      pressAndMove(endOf(0)!, 50);

      expect(lanes()).toEqual([
        ["50%", "50%"],
        ["0%", "50%"],
      ]);
    });

    // @behavior PV-054
    it("snaps a dragged edge to the next Segment", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("preview.snapping");

      await drag(endOf(0)!, 5);

      expect(changes).toEqual([times(0, 0, 600)]);
    });

    // @behavior PV-055
    it("snaps a dragged edge to where the media is", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      media().currentTime = 0.8;
      press("preview.snapping");

      await drag(endOf(0)!, 25);

      expect(changes).toEqual([times(0, 0, 800)]);
    });

    // @behavior PV-056
    it("does not snap while Shift is held once snapping is turned on", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("preview.snapping");

      await drag(endOf(0)!, 5, { shiftKey: true });

      expect(changes).toEqual([times(0, 0, 550)]);
    });

    // @behavior PV-057
    it("does not snap once snapping is turned off", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("preview.snapping");
      press("preview.snapping");

      await drag(endOf(0)!, 5);

      expect(changes).toEqual([times(0, 0, 550)]);
    });

    // @behavior PV-099
    it("does not snap unless snapping is chosen", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);

      await drag(endOf(0)!, 5);

      expect(changes).toEqual([times(0, 0, 550)]);
    });

    // @behavior PV-100
    it("snaps while Shift is held", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);

      await drag(endOf(0)!, 5, { shiftKey: true });

      expect(changes).toEqual([times(0, 0, 600)]);
    });

    // @behavior PV-058
    it("writes nothing for a drag taken back with Esc", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      pressAndMove(endOf(0)!, 20);
      pressKey("Escape");

      letGo();
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior PV-059
    it("writes nothing for a drag that ends where it began", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      pressAndMove(endOf(0)!, 20, {}, -20);

      letGo();
      await settle();

      expect(changes).toEqual([]);
    });

    // @behavior PV-060
    it("moves the edge two Segments share while Alt is held", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.5, 1)]);

      await drag(endOf(0)!, 20, { altKey: true });

      expect(changes).toEqual([{ kind: "boundary", index: 0, at_ms: 700 }]);
    });

    // @behavior PV-061
    it("holds every region while a Mode writes the Current Resource", async () => {
      await showCurrent([segmentAt(0, 0.5)], 0, {
        running_mode: { mode: "transcription" },
      });

      await drag(regions()[0], 20);

      expect([endOf(0), changes]).toEqual([null, []]);
    });

    // @behavior PV-062
    it("inserts a Segment over the range drawn with Enter", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      pressKey("Enter");
      await settle();

      expect(changes).toEqual([
        { kind: "insertion", start_ms: 1000, end_ms: 1500 },
      ]);
    });

    // @behavior ED-056
    it("moves into a Segment drawn on the timeline", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      session.makeCurrent(0);
      await draw(100, 45);

      pressKey("Enter");
      await settle();
      await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(1, 1.5)]));

      expect(session.cursor).toEqual({
        index: 1,
        caret: { kind: "live", field: "text", start: 0, end: 0, text: "" },
      });
    });

    // @behavior ED-047
    it("drops the Cursor when another Segment's region is clicked", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(1, 1.5)]));
      session.enter(0, "text", { start: 2, end: 2 }, "你好世界");
      void session.leave(0, "text", null, "你好世界");

      regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(session.cursor).toEqual({ index: 1, caret: null });
    });

    // @behavior PV-063
    it("drops the range drawn with Esc", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      pressKey("Escape");

      expect(regions().length).toBe(1);
    });

    // @behavior PV-102
    it("keeps the drawn range when Esc is pressed in a text field", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      document
        .querySelector("#typing")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );

      expect(regions().length).toBe(2);
    });

    // @behavior PV-064
    it("draws a range over the next Segment", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(1, 1.5)]));

      await draw(70, 45);

      expect([regions()[2].style.left, regions()[2].style.right]).toEqual([
        "35%",
        "40%",
      ]);
    });

    // @behavior PV-115
    it("draws a range over a Segment with Ctrl held", async () => {
      await show(projectWithMedia([segmentAt(0, 2)]));

      await drawOver(regions()[0], 50, 50, { ctrlKey: true });

      expect([spanTimes(), session.cursor.index]).toEqual([
        "00:00:00.500 → 00:00:01.000 (0.500s)",
        null,
      ]);
    });

    // @behavior PV-117
    it("draws a range over the Current Segment without moving it", async () => {
      await showCurrent([segmentAt(0, 2)]);

      await drawOver(regions()[0], 50, 50, { ctrlKey: true });

      expect([spanTimes(), changes]).toEqual([
        "00:00:00.500 → 00:00:01.000 (0.500s)",
        [],
      ]);
    });

    // @behavior PV-118
    it("draws no range over a Segment without the key", async () => {
      await show(projectWithMedia([segmentAt(0, 2)]));

      await drawOver(regions()[0], 50, 50);

      expect([spanTimes(), regions().length]).toEqual([null, 1]);
    });

    // @behavior PV-140
    it("inserts a Segment drawn over another with Enter", async () => {
      await show(projectWithMedia([segmentAt(0, 2)]));
      await drawOver(regions()[0], 50, 50, { ctrlKey: true });

      pressKey("Enter");
      await settle();

      expect(changes).toEqual([
        { kind: "insertion", start_ms: 500, end_ms: 1000 },
      ]);
    });

    // @behavior PV-072
    it("reads where a dragged Segment lands before it is let go", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("preview.snapping");

      pressAndMove(endOf(0)!, 5);

      expect(spanTimes()).toBe("00:00:00.000 → 00:00:00.600 (0.600s)");
    });

    // @behavior PV-073
    it("reads the times of a range as it is drawn", async () => {
      await show(projectWithMedia());
      const at = { pointerId: 1, button: 0, bubbles: true, cancelable: true };

      wrapper().dispatchEvent(
        new PointerEvent("pointerdown", { ...at, clientX: 100 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...at, clientX: 145 }),
      );

      expect(spanTimes()).toBe("00:00:01.000 → 00:00:01.500 (0.500s)");
    });

    // @behavior PV-074
    it("reads no times once the drawn range is dropped", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      pressKey("Escape");

      expect(spanTimes()).toBeNull();
    });

    const range = () => host().querySelector<HTMLElement>('[part~="range"]')!;
    const rangeEnd = () =>
      range().querySelector<HTMLElement>('[part~="region-handle-right"]')!;
    const insertion = (start_ms: number, end_ms: number) => ({
      kind: "insertion",
      start_ms,
      end_ms,
    });

    // @behavior PV-153
    it("stretches a drawn range by its end", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      await drag(rangeEnd(), 20);
      pressKey("Enter");
      await settle();

      expect(changes).toEqual([insertion(1000, 1700)]);
    });

    // @behavior PV-154
    it("moves a drawn range", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      await drag(range(), 30);
      pressKey("Enter");
      await settle();

      expect(changes).toEqual([insertion(1300, 1800)]);
    });

    // @behavior PV-155
    it("snaps a dragged edge of a drawn range", async () => {
      await show(projectWithMedia([segmentAt(1.8, 2)]));
      press("preview.snapping");
      await draw(100, 45);

      await drag(rangeEnd(), 27);
      pressKey("Enter");
      await settle();

      expect(changes).toEqual([insertion(1000, 1800)]);
    });

    // @behavior PV-156
    it("reads the times of a drawn range as its edge is dragged", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      pressAndMove(rangeEnd(), 20);

      expect(spanTimes()).toBe("00:00:01.000 → 00:00:01.700 (0.700s)");
    });

    // @behavior PV-157
    it("keeps a drawn range when it is clicked", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      range().dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 120 }),
      );
      pressKey("Enter");
      await settle();

      expect(changes).toEqual([insertion(1000, 1500)]);
    });

    // @behavior PV-158
    it("stretches a range drawn over the Current Segment without moving it", async () => {
      await showCurrent([segmentAt(0, 2)]);
      await drawOver(regions()[0], 50, 50, { ctrlKey: true });

      await drag(rangeEnd(), 20);
      pressKey("Enter");
      await settle();

      expect(changes).toEqual([insertion(500, 1200)]);
    });

    // @behavior PV-159
    it("draws a range above the Current Segment's region", async () => {
      await showCurrent([segmentAt(0, 2)]);

      await drawOver(regions()[0], 50, 50, { ctrlKey: true });

      expect(Number(range().style.zIndex)).toBeGreaterThan(
        Number(regions()[0].style.zIndex),
      );
    });

    /** Clicks the waveform at `at` seconds and presses `key` there. */
    async function pressOnWaveform(at: number, key: string): Promise<void> {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      pressOnTimeline(at, key);
    }

    /** Focuses the timeline with the media at `at` seconds and presses `key` there. */
    function pressOnTimeline(at: number, key: string): void {
      const waveform = waveformOf();
      waveform.focus();
      media().currentTime = at;
      waveform.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    }

    // @behavior PV-160
    it("moves the media 0.1 s earlier with ← once the waveform is clicked", async () => {
      await pressOnWaveform(1, "ArrowLeft");

      expect(media().currentTime).toBe(0.9);
    });

    // @behavior PV-161
    it("moves the media 0.1 s later with → once the waveform is clicked", async () => {
      await pressOnWaveform(1, "ArrowRight");

      expect(media().currentTime).toBe(1.1);
    });

    // @behavior PV-208
    it("reads where the media is on the waveform", async () => {
      await show(projectWithMedia());

      media().currentTime = 1.5;
      media().dispatchEvent(new Event("timeupdate"));
      flushSync();

      const waveform = waveformOf();
      expect(
        ["aria-valuenow", "aria-valuemax", "aria-valuetext"].map((name) =>
          waveform.getAttribute(name),
        ),
      ).toEqual(["1.5", "2", "00:00:01.500"]);
    });

    // @behavior PV-162
    it("keeps the media within its length when it is moved with an arrow key", async () => {
      await pressOnWaveform(0.05, "ArrowLeft");

      expect(media().currentTime).toBe(0);
    });

    // @behavior PV-163
    it("leaves the media where it is when an arrow key is pressed with no Waveform", async () => {
      takeWaveform = () =>
        Promise.reject({ code: "step-failed", step: "waveform", detail: "" });
      await show(projectWithMedia());

      pressOnTimeline(1, "ArrowLeft");

      expect(media().currentTime).toBe(1);
    });

    // @behavior PV-065
    it("sets the Current Segment's start where the media is with F11", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      media().currentTime = 0.2;

      pressKey("F11");
      await settle();

      expect(changes).toEqual([times(0, 200, 500)]);
    });

    // @behavior PV-066
    it("sets the Current Segment's end where the media is with F12", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      media().currentTime = 0.8;

      pressKey("F12");
      await settle();

      expect(changes).toEqual([times(0, 0, 800)]);
    });

    // @behavior PV-067
    it("overlaps the next Segment with a time set with a key", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      media().currentTime = 0.8;

      pressKey("F12");
      await settle();

      expect(changes).toEqual([times(0, 0, 800)]);
    });

    // @behavior PV-119
    it("keeps a start set with a key from before the previous Segment's start", async () => {
      await showCurrent([segmentAt(0.3, 0.5), segmentAt(0.6, 1)], 1);
      media().currentTime = 0.2;

      pressKey("F11");
      await settle();

      expect(changes).toEqual([times(1, 300, 1000)]);
    });

    describe("on macOS", () => {
      /** Runs as macOS, connecting the timeline again so it reads the platform as it starts. */
      beforeEach(async () => {
        Object.assign(window, {
          __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
        });
        cleanup();
        await drawTimeline();
      });

      afterEach(() => {
        Object.assign(window, {
          __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
        });
      });

      // @behavior PV-089
      it("sets the Current Segment's start with F9", async () => {
        await showCurrent([segmentAt(0, 0.5)]);
        media().currentTime = 0.2;

        pressKey("F9");
        await settle();

        expect(changes).toEqual([times(0, 200, 500)]);
      });

      // @behavior PV-090
      it("leaves F11 to the system", async () => {
        await showCurrent([segmentAt(0, 0.5)]);
        media().currentTime = 0.2;

        pressKey("F11");
        await settle();

        expect(changes).toEqual([]);
      });

      // @behavior PV-116
      it("draws a range over a Segment with ⌘ held", async () => {
        await show(projectWithMedia([segmentAt(0, 2)]));

        await drawOver(regions()[0], 50, 50, { metaKey: true });

        expect([spanTimes(), session.cursor.index]).toEqual([
          "00:00:00.500 → 00:00:01.000 (0.500s)",
          null,
        ]);
      });
    });
  });
});
