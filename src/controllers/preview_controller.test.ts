// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import PreviewController from "./preview_controller";

describe("PreviewController", () => {
  let application: Application;
  let project: ProjectView | null;
  /** The player, kept as the Video Window takes it out of the page. */
  let player: HTMLVideoElement;
  /** The commands asked of Rust's window plugin, with their arguments. */
  let windowCalls: [string, unknown][];
  let isFullscreen: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = (name: string) =>
    document.querySelector<HTMLElement>(`[data-preview-target="${name}"]`)!;
  const media = () => player;
  const panel = () => target("panel");
  const projectWithMedia = (changes: Partial<ProjectView> = {}) =>
    projectOf({ media: "/talks/ep01.mp4", ...changes });

  async function show(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  /** Makes the media report `seconds` long and at `at`, as a loaded player does. */
  function playTo(at: number, seconds = 10): void {
    Object.defineProperty(media(), "duration", {
      value: seconds,
      configurable: true,
    });
    media().currentTime = at;
    media().dispatchEvent(new Event("timeupdate"));
  }

  const captionLanguage = (value: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-preview-target="captionLanguage"][value="${value}"]`,
    )!;

  const captionBackdrop = (value: string) =>
    document.querySelector<HTMLInputElement>(
      `[data-preview-target="captionBackdrop"][value="${value}"]`,
    )!;

  /** `ep01` with media and `今天` from 0 to 1 s, translated `Today` in `en` shown. */
  const projectTranslated = (changes: Partial<ProjectView> = {}) =>
    projectWithMedia({
      segments: [
        { start_ms: 0, end_ms: 1000, text: "今天", translation: "Today" },
      ],
      shown_translation: "en",
      ...changes,
    });

  const captionSpeaker = () => target("captionSpeaker") as HTMLInputElement;

  /** `ep01` with media and `今天` from 0 to 1 s said by `小明`, translated `Today` in `en` shown, where the Translation Glossary names `小明` as `Xiao Ming`. */
  const projectSpoken = (changes: Partial<ProjectView> = {}) =>
    projectTranslated({
      segments: [
        {
          start_ms: 0,
          end_ms: 1000,
          speaker: "小明",
          text: "今天",
          translation: "Today",
        },
      ],
      shown_speaker_names: { 小明: "Xiao Ming" },
      ...changes,
    });

  /** The Video Window the player is in, or none while it is in the Preview. */
  const videoWindow = () =>
    player.ownerDocument === document ? null : player.ownerDocument.defaultView;

  const videoWindowTarget = (name: string) =>
    player.ownerDocument.querySelector<HTMLElement>(
      `[data-preview-target="${name}"]`,
    )!;

  function pressVideoWindowButton(): void {
    document.querySelector<HTMLElement>("#video-window")!.click();
  }

  function pressPlay(): void {
    document.querySelector<HTMLElement>("#play")!.click();
  }

  beforeEach(async () => {
    localStorage.clear();
    project = null;
    mockConvertFileSrc("macos");
    windowCalls = [];
    isFullscreen = false;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "plugin:window|get_all_windows")
          return ["main", "video"];
        if (command === "plugin:window|is_fullscreen") return isFullscreen;
        if (command.startsWith("plugin:window|"))
          windowCalls.push([command, args]);
        return null;
      },
      { shouldMockEvents: true },
    );
    document.body.innerHTML = `
      <div data-controller="preview" data-action="rust:video-window-closing@window->preview#closeVideoWindow">
        <button id="fold" data-preview-target="foldButton" data-action="preview#toggleFold" hidden><span data-preview-target="foldIcon"></span></button>
        <div data-preview-target="panel" hidden>
        <div data-preview-target="screen">
          <video data-preview-target="media"></video>
          <p data-preview-target="caption"></p>
          <div data-preview-target="hint" hidden></div>
        </div>
        <button id="play" data-action="preview#togglePlayback"><span data-preview-target="playbackIcon"></span></button>
        <button id="video-window" data-preview-target="videoWindowButton" data-action="preview#toggleVideoWindow"></button>
        <span data-preview-target="time"></span>
        <input type="range" min="0" max="100" data-preview-target="volume" data-action="input->preview#setVolume">
        <span data-preview-target="volumeLevel"></span><button id="mute" data-preview-target="muteButton" data-action="preview#toggleMute"><span data-preview-target="muteIcon"></span></button>
        <div data-preview-target="captionChoice">
          <input type="radio" name="caption" value="original" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="caption" value="translation" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="caption" value="bilingual" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="backdrop" value="none" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="radio" name="backdrop" value="translucent" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="radio" name="backdrop" value="opaque" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="checkbox" data-preview-target="captionSpeaker" data-action="preview#toggleCaptionSpeaker">
        </div>
          <div data-preview-target="currentSection">
          <p data-preview-target="currentHint"></p>
          <div data-preview-target="currentCard" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><span data-preview-target="currentSpeaker" hidden></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p></div></div>
        </div>
      </div>
    `;
    player = document.querySelector("video")!;
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    videoWindow()?.close();
    clearMocks();
    vi.restoreAllMocks();
  });

  // @behavior PV-008
  it("reads the Current Resource's media through the asset protocol", async () => {
    await show(projectWithMedia());

    expect(media().getAttribute("src")).toBe(
      "asset://localhost/%2Ftalks%2Fep01.mp4",
    );
  });

  // @behavior PV-009
  it("shows no player or controls for a Resource without media", async () => {
    await show(projectOf());

    expect(panel().hidden).toBe(true);
  });

  // @behavior PV-010
  it("shows the controls without the video for media without a picture", async () => {
    await show(projectWithMedia());
    Object.defineProperty(media(), "videoWidth", { value: 0 });

    media().dispatchEvent(new Event("loadedmetadata"));

    expect([target("screen").hidden, panel().hidden]).toEqual([true, false]);
  });

  // @behavior PV-011
  it("puts a hint in the video's place when the media cannot be played", async () => {
    await show(projectWithMedia());

    media().dispatchEvent(new Event("error"));

    expect([media().hidden, target("hint").hidden]).toEqual([true, false]);
  });

  // @behavior PV-012
  it("plays the media when play is pressed", async () => {
    await show(projectWithMedia());

    pressPlay();

    expect(media().paused).toBe(false);
  });

  // @behavior PV-013
  it("pauses the media when play is pressed while it plays", async () => {
    await show(projectWithMedia());
    pressPlay();

    pressPlay();

    expect(media().paused).toBe(true);
  });

  // @behavior PV-014
  it("shows where the media is and how long it lasts", async () => {
    await show(projectWithMedia());

    playTo(62, 24 * 60 + 10);

    expect(target("time").textContent).toBe("01:02 / 24:10");
  });

  // @behavior PV-014
  it("shows the hours of media lasting an hour or more", async () => {
    await show(projectWithMedia());

    playTo(62, 60 * 60 + 2 * 60 + 5);

    expect(target("time").textContent).toBe("01:02 / 1:02:05");
  });

  // @behavior PV-015
  it("shows the Segment being played over the video", async () => {
    await show(
      projectWithMedia({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
        ],
      }),
    );

    playTo(1.5);

    expect(target("caption").textContent).toBe("今天");
  });

  describe("with a Segment said over another", () => {
    const overlappingProject = (
      segments = [
        { start_ms: 0, end_ms: 2000, text: "大家好" },
        { start_ms: 1000, end_ms: 1500, text: "對啊" },
      ],
    ) => projectWithMedia({ segments });

    // @behavior PV-103
    it("shows it over the video above the one it overlaps", async () => {
      await show(overlappingProject());

      playTo(1.2);

      expect(target("caption").textContent).toBe("對啊\n大家好");
    });

    // @behavior PV-104
    it("keeps the Segment it overlapped over the video once it ends", async () => {
      await show(overlappingProject());

      playTo(1.8);

      expect(target("caption").textContent).toBe("大家好");
    });

    // @behavior PV-105
    it("stacks Segments that start together in their order", async () => {
      await show(
        overlappingProject([
          { start_ms: 0, end_ms: 1000, text: "大家好" },
          { start_ms: 0, end_ms: 1000, text: "對啊" },
        ]),
      );

      playTo(0.5);

      expect(target("caption").textContent).toBe("對啊\n大家好");
    });
  });

  // @behavior PV-088
  it("shows the Segment over the video on the frame the media reaches it", async () => {
    await show(
      projectWithMedia({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
        ],
      }),
    );
    pressPlay();

    media().currentTime = 1.05;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(target("caption").textContent).toBe("今天");
  });

  // @behavior PV-016
  it("shows nothing over the video between Segments", async () => {
    await show(
      projectWithMedia({
        segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
      }),
    );

    playTo(1.5);

    expect(target("caption").textContent).toBe("");
  });

  // @behavior PV-043
  it("shows the translation shown over the video once it is chosen", async () => {
    await show(projectTranslated());

    captionLanguage("translation").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("Today");
  });

  // @behavior PV-044
  it("shows both languages over the video with the original first", async () => {
    await show(projectTranslated());

    captionLanguage("bilingual").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("今天\nToday");
  });

  // @behavior PV-045
  it("shows both languages over the video with the translation first when the Bilingual Order says so", async () => {
    await show(
      projectTranslated({
        options: {
          ...projectOf().options,
          bilingual_order: "translation-first",
        },
      }),
    );

    captionLanguage("bilingual").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("Today\n今天");
  });

  // @behavior PV-046
  it("shows the original alone over the video while no translation is shown", async () => {
    await show(projectTranslated());
    captionLanguage("bilingual").click();

    await show(
      projectWithMedia({
        segments: [{ start_ms: 0, end_ms: 1000, text: "今天" }],
      }),
    );
    playTo(0.5);

    expect(target("caption").textContent).toBe("今天");
  });

  // @behavior PV-047
  it("offers only the original over the video while no translation is shown", async () => {
    await show(projectWithMedia());

    expect(
      ["original", "translation", "bilingual"].map(
        (value) => captionLanguage(value).disabled,
      ),
    ).toEqual([false, true, true]);
  });

  // @behavior PV-048
  it("keeps what is shown over the video for the next Resource", async () => {
    await show(projectTranslated());
    captionLanguage("bilingual").click();
    application.stop();
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();

    await show(projectTranslated({ media: "/talks/ep02.mp4" }));

    expect(captionLanguage("bilingual").checked).toBe(true);
  });

  // @behavior PV-049
  it("offers no choice over the video for media without a picture", async () => {
    await show(projectTranslated());
    Object.defineProperty(media(), "videoWidth", { value: 0 });

    media().dispatchEvent(new Event("loadedmetadata"));

    expect(target("captionChoice").hidden).toBe(true);
  });

  // @behavior PV-068
  it("shows what is over the video on a translucent black by default", async () => {
    await show(projectWithMedia());

    expect(target("caption").dataset.backdrop).toBe("translucent");
  });

  // @behavior PV-069
  it("shows what is over the video on the backdrop chosen", async () => {
    await show(projectWithMedia());

    captionBackdrop("opaque").click();

    expect(target("caption").dataset.backdrop).toBe("opaque");
  });

  // @behavior PV-070
  it("keeps the backdrop over the video for the next Resource", async () => {
    await show(projectWithMedia());
    captionBackdrop("none").click();
    application.stop();
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect([
      target("caption").dataset.backdrop,
      captionBackdrop("none").checked,
    ]).toEqual(["none", true]);
  });

  // @behavior PV-092
  it("names the Speaker over the video by default", async () => {
    await show(projectSpoken());

    playTo(0.5);

    expect([target("caption").textContent, captionSpeaker().checked]).toEqual([
      "小明: 今天",
      true,
    ]);
  });

  // @behavior PV-093
  it("names the Speaker in the translation over the video as the Translation Glossary does", async () => {
    await show(projectSpoken());

    captionLanguage("translation").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("Xiao Ming: Today");
  });

  it("keeps a Speaker's name the Translation Glossary does not give over the translation", async () => {
    await show(projectSpoken({ shown_speaker_names: {} }));

    captionLanguage("translation").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("小明: Today");
  });

  // @behavior PV-094
  it("names the Speaker in both languages over the video", async () => {
    await show(projectSpoken());

    captionLanguage("bilingual").click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("小明: 今天\nXiao Ming: Today");
  });

  // @behavior PV-106
  it("names the Speaker of each overlapping Segment over the video", async () => {
    await show(
      projectSpoken({
        segments: [
          { start_ms: 0, end_ms: 2000, speaker: "小明", text: "大家好" },
          { start_ms: 1000, end_ms: 1500, speaker: "小華", text: "對啊" },
        ],
      }),
    );

    playTo(1.2);

    expect(target("caption").textContent).toBe("小華: 對啊\n小明: 大家好");
  });

  it("names the Speaker once before a caption of several lines", async () => {
    await show(
      projectSpoken({
        segments: [
          { start_ms: 0, end_ms: 1000, speaker: "小明", text: "今天\n天氣好" },
        ],
      }),
    );

    playTo(0.5);

    expect(target("caption").textContent).toBe("小明: 今天\n天氣好");
  });

  // @behavior PV-095
  it("shows the text alone over the video once the Speaker is turned off", async () => {
    await show(projectSpoken());

    captionSpeaker().click();
    playTo(0.5);

    expect(target("caption").textContent).toBe("今天");
  });

  // @behavior PV-096
  it("keeps the Speaker over the video off for the next Resource", async () => {
    await show(projectSpoken());
    captionSpeaker().click();
    application.stop();
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();

    await show(projectSpoken({ media: "/talks/ep02.mp4" }));
    playTo(0.5);

    expect([target("caption").textContent, captionSpeaker().checked]).toEqual([
      "今天",
      false,
    ]);
  });

  // @behavior PV-034
  it("hides the Preview when its fold button is pressed", async () => {
    await show(projectWithMedia());

    document.querySelector<HTMLElement>("#fold")!.click();

    expect(panel().hidden).toBe(true);
  });

  // @behavior PV-035
  it("keeps the Preview folded for the next Resource with media", async () => {
    await show(projectWithMedia());
    document.querySelector<HTMLElement>("#fold")!.click();
    application.stop();
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(panel().hidden).toBe(true);
  });

  const volumeSlider = () =>
    document.querySelector<HTMLInputElement>('[data-preview-target="volume"]')!;

  function moveVolumeSlider(value: number): void {
    volumeSlider().value = String(value);
    volumeSlider().dispatchEvent(new Event("input", { bubbles: true }));
  }

  // @behavior PV-164
  it("plays at full volume until a volume is chosen", async () => {
    await show(projectWithMedia());

    expect([volumeSlider().value, player.volume]).toEqual(["50", 1]);
  });

  // @behavior PV-165
  it("sets the volume with its slider", async () => {
    await show(projectWithMedia());

    moveVolumeSlider(25);

    expect(player.volume).toBe(0.125);
  });

  async function reopenWith(choices: Record<string, string>): Promise<void> {
    application.stop();
    player.removeAttribute("crossorigin");
    player.volume = 1;
    for (const [key, value] of Object.entries(choices))
      localStorage.setItem(key, value);
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();
  }

  // @behavior PV-166
  it("keeps the volume chosen for the next time the Preview opens", async () => {
    moveVolumeSlider(25);

    await reopenWith({});

    expect([volumeSlider().value, player.volume]).toEqual(["25", 0.125]);
  });

  const pressMute = () => document.querySelector<HTMLElement>("#mute")!.click();

  // @behavior PV-179
  it("reads the volume beside its slider", async () => {
    await show(projectWithMedia());

    moveVolumeSlider(30);

    expect(
      document.querySelector('[data-preview-target="volumeLevel"]')!
        .textContent,
    ).toBe("22%");
  });

  // @behavior PV-180
  it("mutes the media", async () => {
    await show(projectWithMedia());

    pressMute();

    expect(player.volume).toBe(0);
  });

  // @behavior PV-181
  it("unmutes back to the volume chosen", async () => {
    await show(projectWithMedia());
    moveVolumeSlider(25);
    pressMute();

    pressMute();

    expect(player.volume).toBe(0.125);
  });

  // @behavior PV-182
  it("unmutes with the volume slider", async () => {
    await show(projectWithMedia());
    pressMute();

    moveVolumeSlider(25);

    expect(player.volume).toBe(0.125);
  });

  // @behavior PV-183
  it("plays with sound each time the Preview opens", async () => {
    moveVolumeSlider(25);
    pressMute();

    await reopenWith({});

    expect(player.volume).toBe(0.125);
  });

  // @behavior PV-173
  it("reads the media with anonymous CORS", async () => {
    await reopenWith({});

    expect(player.crossOrigin).toBe("anonymous");
  });

  describe("above full volume", () => {
    /** The Web Audio contexts made, each with the nodes the player is routed through. */
    let contexts: FakeAudioContext[];

    type FakeNode = {
      kind: string;
      next?: FakeNode;
      connect(node: FakeNode): FakeNode;
    } & Record<string, unknown>;

    function fakeNode(kind: string, params: Record<string, number> = {}) {
      const node: FakeNode = {
        kind,
        connect(next) {
          node.next = next;
          return next;
        },
      };
      for (const [name, value] of Object.entries(params))
        node[name] = { value };
      return node;
    }

    class FakeAudioContext {
      readonly destination = fakeNode("destination");
      readonly sources: HTMLMediaElement[] = [];
      source?: FakeNode;
      readonly resume = vi.fn(() => Promise.resolve());

      constructor() {
        contexts.push(this);
      }

      createGain() {
        return fakeNode("gain", { gain: 1 });
      }

      // The defaults Web Audio gives a new compressor
      createDynamicsCompressor() {
        return fakeNode("limiter", {
          threshold: -24,
          knee: 30,
          ratio: 12,
          attack: 0.003,
          release: 0.25,
        });
      }

      createMediaElementSource(element: HTMLMediaElement) {
        this.sources.push(element);
        this.source = fakeNode("source");
        return this.source;
      }
    }

    /** The nodes from the player's source to the speakers. */
    function nodesToSpeakers(context: FakeAudioContext): FakeNode[] {
      const nodes: FakeNode[] = [];
      for (let node = context.source; node; node = node.next) nodes.push(node);
      return nodes;
    }

    const paramValue = (node: FakeNode, name: string) =>
      (node[name] as { value: number }).value;

    /**
     * How loud a quiet passage plays through `context`: every gain on the way times the makeup gain
     * each compressor adds, per Web Audio 1.1 "Computing the makeup gain" for a hard knee.
     */
    function quietPassageVolume(context: FakeAudioContext): number {
      return nodesToSpeakers(context).reduce((volume, node) => {
        if (node.kind === "gain") return volume * paramValue(node, "gain");
        if (node.kind !== "limiter") return volume;
        const threshold = paramValue(node, "threshold");
        const fullRangeDb = threshold - threshold / paramValue(node, "ratio");
        return volume * (10 ** (-fullRangeDb / 20)) ** 0.6;
      }, 1);
    }

    beforeEach(async () => {
      contexts = [];
      vi.stubGlobal("AudioContext", FakeAudioContext);
      await show(projectWithMedia());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // @behavior PV-171
    it("plays up to eight times the media's volume through Web Audio", () => {
      moveVolumeSlider(100);
      player.dispatchEvent(new Event("play"));

      expect([
        player.volume,
        contexts.map((context) => [
          context.sources,
          context.resume.mock.calls.length > 0,
          quietPassageVolume(context).toFixed(6),
        ]),
      ]).toEqual([1, [[[player], true, (8).toFixed(6)]]]);
    });

    // @behavior PV-172
    it("leaves Web Audio out until the volume passes 100", () => {
      moveVolumeSlider(25);

      expect([player.volume, contexts.length]).toEqual([0.125, 0]);
    });

    // @behavior PV-180
    it("mutes the media above full volume", () => {
      moveVolumeSlider(100);

      pressMute();

      expect(quietPassageVolume(contexts[0])).toBe(0);
    });

    // @behavior PV-177
    it("holds loud passages at -1 dBFS through a limiter", () => {
      moveVolumeSlider(100);

      const limiters = nodesToSpeakers(contexts[0])
        .filter((node) => node.kind === "limiter")
        .map((node) => [
          paramValue(node, "threshold"),
          paramValue(node, "knee"),
          paramValue(node, "ratio"),
          node.next?.kind,
        ]);
      expect(limiters).toEqual([[-1, 0, 20, "gain"]]);
    });

    // @behavior PV-178
    it("takes the limiter's makeup gain back below its threshold", () => {
      moveVolumeSlider(100);

      moveVolumeSlider(50);

      expect([
        player.volume,
        quietPassageVolume(contexts[0]).toFixed(6),
      ]).toEqual([1, (1).toFixed(6)]);
    });
  });

  describe("the Video Window", () => {
    /**
     * Has `player` start over as Chromium does once it is moved to another page, which reloads it,
     * where happy-dom keeps its time.
     */
    function startOverOnMove(player: HTMLMediaElement): void {
      let time = 0;
      let page = player.ownerDocument;
      Object.defineProperty(player, "currentTime", {
        configurable: true,
        get: () => {
          if (player.ownerDocument !== page) {
            page = player.ownerDocument;
            time = 0;
          }
          return time;
        },
        set: (value: number) => {
          page = player.ownerDocument;
          time = value;
        },
      });
    }

    beforeEach(() => startOverOnMove(media()));

    // @behavior PV-127
    it("plays the video on from where it was in a window of its own", async () => {
      await show(projectWithMedia());
      pressPlay();
      playTo(3);

      pressVideoWindowButton();

      expect([
        videoWindow() !== null,
        media().paused,
        media().currentTime,
      ]).toEqual([true, false, 3]);
    });

    // @behavior PV-128
    it("shows only the controls, without the Current Segment's card, while the video is away", async () => {
      await show(projectWithMedia());

      pressVideoWindowButton();

      expect(target("currentSection").hidden).toBe(true);
    });

    // @behavior PV-139
    it("shows the Current Segment's card again as the video comes back", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();

      pressVideoWindowButton();

      expect(target("currentSection").hidden).toBe(false);
    });

    // @behavior PV-129
    it("shows the Segment being played over the video in the Video Window", async () => {
      await show(
        projectWithMedia({
          segments: [{ start_ms: 0, end_ms: 1000, text: "今天" }],
        }),
      );
      pressVideoWindowButton();

      playTo(0.5);

      expect(videoWindowTarget("caption").textContent).toBe("今天");
    });

    // @behavior PV-130
    it("plays the video on from where it was in the Preview as the Video Window is closed", async () => {
      await show(projectWithMedia());
      pressPlay();
      playTo(3);
      pressVideoWindowButton();
      const awayTime = media().currentTime;

      await emit("video-window-closing");
      await settle();

      expect([
        awayTime,
        videoWindow(),
        media().paused,
        media().currentTime,
      ]).toEqual([3, null, false, 3]);
    });

    // @behavior PV-131
    it("closes the Video Window with the video back in the Preview when its button is pressed again", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();

      pressVideoWindowButton();
      await settle();

      expect([videoWindow(), windowCalls]).toEqual([
        null,
        [["plugin:window|destroy", { label: "video" }]],
      ]);
    });

    // @behavior PV-167
    it("opens the Video Window again only once the last one is gone", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();
      const open = window.open.bind(window);
      vi.spyOn(window, "open").mockImplementation((url, name, features) => {
        windowCalls.push(["window.open", name]);
        return open(url, name, features);
      });

      pressVideoWindowButton();
      pressVideoWindowButton();
      await settle();

      expect([videoWindow() !== null, windowCalls]).toEqual([
        true,
        [
          ["plugin:window|destroy", { label: "video" }],
          ["window.open", "video"],
        ],
      ]);
    });

    // @behavior PV-133
    it("fills the screen with the Video Window when the video is double-clicked", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();

      media().dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await settle();

      expect(windowCalls).toEqual([
        ["plugin:window|set_fullscreen", { label: "video", value: true }],
      ]);
    });

    // @behavior PV-134
    it("leaves the full screen when Esc is pressed in the Video Window", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();
      isFullscreen = true;

      media().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await settle();

      expect(windowCalls).toEqual([
        ["plugin:window|set_fullscreen", { label: "video", value: false }],
      ]);
    });

    // @behavior PV-135
    it("shows the next Resource's video in the Video Window", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();

      await show(projectWithMedia({ media: "/talks/ep02.mp4" }));

      expect([videoWindow() !== null, media().getAttribute("src")]).toEqual([
        true,
        "asset://localhost/%2Ftalks%2Fep02.mp4",
      ]);
    });

    // @behavior PV-136
    it("closes the Video Window for media without a picture", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();
      await show(projectWithMedia({ media: "/talks/ep02.m4a" }));
      Object.defineProperty(media(), "videoWidth", { value: 0 });

      media().dispatchEvent(new Event("loadedmetadata"));
      await settle();

      expect([videoWindow(), windowCalls]).toEqual([
        null,
        [["plugin:window|destroy", { label: "video" }]],
      ]);
    });
  });
});
