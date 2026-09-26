// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type { EditingSession } from "../editor";
import type { SegmentChange } from "../backend/editing";
import type { ProjectView, Segment } from "../backend/project";
import type { Waveform } from "../backend/waveform";
import { layOutTimeline } from "../test_layout";
import { projectOf } from "../test_project";
import TimelineController, {
  controlOption,
  regionColor,
} from "./timeline_controller";

describe("TimelineController", () => {
  let application: Application;
  let session: EditingSession;
  let project: ProjectView | null;
  let waveform: Waveform;
  let changes: SegmentChange[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const host = () =>
    document.querySelector<HTMLElement>('[data-timeline-target="waveform"]')!
      .firstElementChild!.shadowRoot!;
  const wrapper = () => host().querySelector<HTMLElement>(".wrapper")!;
  const regions = () => [
    ...host().querySelectorAll<HTMLElement>('[part~="region"]'),
  ];
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

  function press(action: string): void {
    document.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
  }

  let takeLayoutBack: () => void;

  beforeEach(async () => {
    takeLayoutBack = layOutTimeline();
    localStorage.clear();
    // The regions measure a drag against their own width: 200 pixels over two seconds of Peaks
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 }),
    );
    project = null;
    changes = [];
    waveform = {
      media: "/talks/ep01.mp4",
      peaks_per_second: 100,
      peaks: Array.from({ length: 200 }, (_, index) => (index % 10) / 10),
    };
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "extract_waveform") return waveform;
        if (command === "change_segments")
          changes.push((args as { change: SegmentChange }).change);
        return null;
      },
      { shouldMockEvents: true },
    );
    document.body.innerHTML = `
      <div data-controller="timeline" data-action="editor:cursor@window->timeline#showCursor keydown@window->timeline#setTimeAtMedia keydown.esc@window->timeline#cancel:!control keydown.enter@window->timeline#insertRange pointerdown@window->timeline#followModifiers:capture pointermove@window->timeline#followModifiers:capture">
        <video data-timeline-target="media"></video>
        <input id="typing" />
        <button data-timeline-target="snapButton" data-action="timeline#toggleSnapping"></button>
        <span data-timeline-target="times" hidden></span>
        <button data-timeline-target="aloneButton"></button><span data-timeline-target="spaceHint"></span><kbd data-timeline-target="startKey"></kbd><kbd data-timeline-target="endKey"></kbd>
        <button data-action="timeline#zoomOut"></button>
        <button data-action="timeline#zoomIn"></button>
        <button data-timeline-target="zoomLevel" data-action="timeline#resetZoom"></button><div data-timeline-target="waveform" data-action="wheel->timeline#scrollOrZoom:prevent" hidden></div>
      </div>
    `;
    application = Application.start();
    application.registerActionOption("control", controlOption);
    const assembly = assemble(application, {
      timeline: TimelineController,
    });
    session = assembly.session;
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.restoreAllMocks();
    takeLayoutBack();
  });

  // @behavior PV-017
  it("draws the Waveform over the time its Peaks cover", async () => {
    await show(projectWithMedia());

    expect(wrapper().style.width).toBe("200px");
  });

  // @behavior PV-018
  it("does not draw a Waveform of media no longer current", async () => {
    waveform = { ...waveform, media: "/talks/ep01.mp4" };

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(
      document.querySelector('[data-timeline-target="waveform"]')!
        .childElementCount,
    ).toBe(0);
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

  // @behavior PV-020
  it("follows an added Segment at the same zoom", async () => {
    await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1)]));
    press("timeline#zoomIn");

    await show(
      projectWithMedia([segmentAt(0, 0.5), segmentAt(0.5, 1), segmentAt(1, 2)]),
    );

    expect([regions().length, wrapper().style.width]).toEqual([3, "400px"]);
  });

  // @behavior PV-021
  it("doubles the pixels a second when zooming in", async () => {
    await show(projectWithMedia());

    press("timeline#zoomIn");

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-022
  it("halves the pixels a second when zooming out", async () => {
    await show(projectWithMedia());

    press("timeline#zoomOut");

    expect(wrapper().style.width).toBe("100px");
  });

  // @behavior PV-023
  it("scrolls later as the wheel turns down", async () => {
    await show(projectWithMedia());
    const scroller = host().querySelector<HTMLElement>(".scroll")!;

    document
      .querySelector('[data-timeline-target="waveform"]')!
      .dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));

    expect(scroller.scrollLeft).toBe(120);
  });

  // @behavior PV-033
  it("zooms in as the wheel turns up with Ctrl held", async () => {
    await show(projectWithMedia());
    const pinch = new WheelEvent("wheel", { deltaY: -200 * Math.log(2) });
    // happy-dom's WheelEvent is not a MouseEvent, so it keeps no modifier keys.
    Object.defineProperty(pinch, "ctrlKey", { value: true });

    document
      .querySelector('[data-timeline-target="waveform"]')!
      .dispatchEvent(pinch);

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-040
  it("zooms in as the wheel turns up with Alt held", async () => {
    await show(projectWithMedia());
    const turn = new WheelEvent("wheel", { deltaY: -200 * Math.log(2) });
    // happy-dom's WheelEvent is not a MouseEvent, so it keeps no modifier keys.
    Object.defineProperty(turn, "altKey", { value: true });

    document
      .querySelector('[data-timeline-target="waveform"]')!
      .dispatchEvent(turn);

    expect(wrapper().style.width).toBe("400px");
  });

  // @behavior PV-041
  it("reads the zoom level as a percentage of where it starts", async () => {
    await show(projectWithMedia());

    press("timeline#zoomIn");

    expect(
      document.querySelector('[data-timeline-target="zoomLevel"]')!.textContent,
    ).toBe("200%");
  });

  // @behavior PV-042
  it("goes back to where it started when the zoom level is pressed", async () => {
    await show(projectWithMedia());
    press("timeline#zoomIn");

    document
      .querySelector<HTMLElement>('[data-timeline-target="zoomLevel"]')!
      .click();

    expect(wrapper().style.width).toBe("200px");
  });
  const spanTimes = () =>
    document.querySelector<HTMLElement>('[data-timeline-target="times"]')!;

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
    const media = () =>
      document.querySelector<HTMLVideoElement>(
        '[data-timeline-target="media"]',
      )!;

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
    it("stops a dragged edge at the next Segment", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1.5)]);

      await drag(endOf(0)!, 50);

      expect(changes).toEqual([times(0, 0, 600)]);
    });

    // @behavior PV-054
    it("snaps a dragged edge to the next Segment", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("timeline#toggleSnapping");

      await drag(endOf(0)!, 5);

      expect(changes).toEqual([times(0, 0, 600)]);
    });

    // @behavior PV-055
    it("snaps a dragged edge to where the media is", async () => {
      await showCurrent([segmentAt(0, 0.5)]);
      media().currentTime = 0.8;
      press("timeline#toggleSnapping");

      await drag(endOf(0)!, 25);

      expect(changes).toEqual([times(0, 0, 800)]);
    });

    // @behavior PV-056
    it("does not snap while Shift is held once snapping is turned on", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("timeline#toggleSnapping");

      await drag(endOf(0)!, 5, { shiftKey: true });

      expect(changes).toEqual([times(0, 0, 550)]);
    });

    // @behavior PV-057
    it("does not snap once snapping is turned off", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("timeline#toggleSnapping");
      press("timeline#toggleSnapping");

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

    // @behavior PV-092
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
    it("keeps a drawn range out of the next Segment", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5), segmentAt(1, 1.5)]));

      await draw(70, 45);

      expect([regions()[2].style.left, regions()[2].style.right]).toEqual([
        "35%",
        "50%",
      ]);
    });

    // @behavior PV-072
    it("reads where a dragged Segment lands before it is let go", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      press("timeline#toggleSnapping");

      pressAndMove(endOf(0)!, 5);

      expect([spanTimes().hidden, spanTimes().textContent]).toEqual([
        false,
        "00:00:00.000 → 00:00:00.600 (0.600s)",
      ]);
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

      expect([spanTimes().hidden, spanTimes().textContent]).toEqual([
        false,
        "00:00:01.000 → 00:00:01.500 (0.500s)",
      ]);
    });

    // @behavior PV-074
    it("reads no times once the drawn range is dropped", async () => {
      await show(projectWithMedia([segmentAt(0, 0.5)]));
      await draw(100, 45);

      pressKey("Escape");

      expect([spanTimes().hidden, spanTimes().textContent]).toEqual([true, ""]);
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
    it("keeps a time set with a key out of the next Segment", async () => {
      await showCurrent([segmentAt(0, 0.5), segmentAt(0.6, 1)]);
      media().currentTime = 0.8;

      pressKey("F12");
      await settle();

      expect(changes).toEqual([times(0, 0, 600)]);
    });

    describe("on macOS", () => {
      /** Runs as macOS, connecting the timeline again so it reads the platform as it starts. */
      beforeEach(async () => {
        Object.assign(window, {
          __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
        });
        const timeline = document.querySelector(
          '[data-controller="timeline"]',
        )!;
        timeline.remove();
        document.body.append(timeline);
        await settle();
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

      // @behavior PV-091
      it("names F9 and F12 as the keys that set times", () => {
        const keys = [
          ...document.querySelectorAll('[data-timeline-target$="Key"]'),
        ].map((key) => key.textContent);

        expect(keys).toEqual(["F9", "F12"]);
      });
    });
  });
});
