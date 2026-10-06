// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assemble } from "#/assembly.ts";
import { DEFAULT_PREFERENCES } from "#/ipc/preferences.ts";
import type { ProjectView } from "#/ipc/project.ts";
import type { EditingSession } from "#/editor/index.ts";
import { setInterfaceLanguage, t } from "#/i18n.ts";
import { projectOf } from "#/testing/project.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import { pageContext } from "#/state/context.ts";
import EditorBar from "#/components/EditorBar.svelte";
import { Playback } from "#/state/playback.svelte.ts";
import Preview from "#/components/Preview.svelte";
import { PreviewFold } from "#/state/preview-fold.svelte.ts";

describe("Preview", () => {
  let session: EditingSession;
  let project: ProjectView | null;
  /** The player of the Preview drawn last, kept as the Video Window takes it out of the page. */
  let player: HTMLVideoElement;
  /** The commands asked of Rust's window plugin, with their arguments. */
  let windowCalls: [string, unknown][];
  let isFullscreen: boolean;
  /** The Preview's root element, holding the player's row and the timeline. */
  let panel: () => HTMLElement;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const media = () => player;
  /** The screen the media plays on, with the Segment being played over it. */
  const screenOf = () => player.parentElement!;
  /** What is shown over the video, wherever the video is. */
  const caption = () => screenOf().querySelector<HTMLElement>("p > span")!;
  /** The hint taking the video's place when the media cannot be played. */
  const hint = () => screenOf().querySelector<HTMLElement>('[role="alert"]')!;
  const clock = () => screen.getByRole("timer");
  /** The row the video sits in beside the Current Segment's card. */
  const screenRow = () => panel().firstElementChild as HTMLElement;
  const timelineFrame = () => panel().lastElementChild as HTMLElement;
  const button = (label: string) =>
    screen.getByRole<HTMLButtonElement>("button", { name: t(label) });
  const projectWithMedia = (changes: Partial<ProjectView> = {}) =>
    projectOf({ media: "/talks/ep01.mp4", ...changes });

  async function show(next: ProjectView | null): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  /** Draws the Preview with the editor bar folding its parts, as the page draws them. */
  async function draw(): Promise<void> {
    const assembly = assemble();
    session = assembly.session;
    const context = pageContext(assembly.feed, assembly.session);
    const playback = new Playback();
    const fold = new PreviewFold();
    player = playback.media;
    renderFollowingProject(EditorBar, assembly.feed, {
      props: {
        openReplacement: () => {},
        openVersions: () => {},
        openSearch: () => {},
        openSpeakers: () => {},
        fold,
      },
      context,
    });
    const { container } = render(Preview, {
      props: { playback, fold },
      context,
    });
    panel = () => container.firstElementChild as HTMLElement;
    await assembly.start();
    await settle();
  }

  /** Starts the Preview over, as the next time the app opens. */
  async function reopen(): Promise<void> {
    cleanup();
    await draw();
  }

  /** Makes the media report `seconds` long and at `at`, as a loaded player does. */
  function playTo(at: number, seconds = 10): void {
    Object.defineProperty(media(), "duration", {
      value: seconds,
      configurable: true,
    });
    media().currentTime = at;
    media().dispatchEvent(new Event("timeupdate"));
    flushSync();
  }

  /** The radio button of the group labelled `group`, labelled by the key `prefix` followed by `value`, as `captionOriginal` is for `original`. */
  const choice = (group: string, prefix: string, value: string) =>
    within(
      screen.getByRole("radiogroup", { name: t(group) }),
    ).getByRole<HTMLInputElement>("radio", {
      name: t(`${prefix}${value[0].toUpperCase()}${value.slice(1)}`),
    });
  const captionLanguage = (value: string) =>
    choice("preview.captionLanguage", "preview.caption", value);
  const captionBackdrop = (value: string) =>
    choice("preview.captionBackdrop", "preview.captionBackdrop", value);
  const dummyVideoColour = (value: string) =>
    choice("preview.dummyVideo", "preview.dummyVideo", value);

  /** A Resource without media whose one Segment ends at `endMs`. */
  const projectEndingAt = (endMs: number) =>
    projectOf({ segments: [{ start_ms: 0, end_ms: endMs, text: "Hello" }] });

  /** Keeps each Blob the Preview makes a URL for, naming them `blob:silence-1` onwards. */
  function keepMadeSilence(): Blob[] {
    const silences: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      silences.push(blob as Blob);
      return `blob:silence-${silences.length}`;
    });
    return silences;
  }

  /** Starts the player over at 0 once its source changes, as a browser does and happy-dom does not. */
  function startOverOnNewSource(): void {
    const { set } = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "src",
    )!;
    Object.defineProperty(media(), "src", {
      configurable: true,
      set(value: string) {
        set!.call(this, value);
        (this as HTMLMediaElement).currentTime = 0;
      },
    });
  }

  /** How long a WAV of silence lasts, read from its header and data as a player reads them. */
  async function silenceSeconds(wav: Blob): Promise<number> {
    const bytes = await wav.arrayBuffer();
    const sampleRate = new DataView(bytes).getUint32(24, true);
    return (bytes.byteLength - 44) / sampleRate;
  }

  /** Makes the media report a picture `width` by `height`, none at 0, as loaded metadata does. */
  function loadPicture(width: number, height: number): void {
    Object.defineProperty(media(), "videoWidth", {
      value: width,
      configurable: true,
    });
    Object.defineProperty(media(), "videoHeight", {
      value: height,
      configurable: true,
    });
    media().dispatchEvent(new Event("loadedmetadata"));
    flushSync();
  }

  /** `ep01` with media and `今天` from 0 to 1 s, translated `Today` in `en` shown. */
  const projectTranslated = (changes: Partial<ProjectView> = {}) =>
    projectWithMedia({
      segments: [
        { start_ms: 0, end_ms: 1000, text: "今天", translation: "Today" },
      ],
      shown_translation: "en",
      ...changes,
    });

  const captionSpeaker = () =>
    screen.getByRole<HTMLInputElement>("checkbox", {
      name: t("preview.captionSpeaker"),
    });

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

  function pressVideoWindowButton(): void {
    button("preview.videoWindow").click();
    flushSync();
  }

  function pressPlay(): void {
    button("preview.play").click();
  }

  /** Whether the Current Segment's card, or the hint asking for one, is beside the video. */
  const isCardShown = () =>
    screen.queryByText(t("preview.pickSegment")) !== null;

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    localStorage.clear();
    project = null;
    mockConvertFileSrc("macos");
    windowCalls = [];
    isFullscreen = false;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "preferences") return DEFAULT_PREFERENCES;
        if (command === "plugin:window|get_all_windows")
          return ["main", "video"];
        if (command === "plugin:window|is_fullscreen") return isFullscreen;
        if (command.startsWith("plugin:window|"))
          windowCalls.push([command, args]);
        return null;
      },
      { shouldMockEvents: true },
    );
    await draw();
  });

  afterEach(async () => {
    videoWindow()?.close();
    cleanup();
    // Taking the Preview away closes the Video Window, which asks Rust once the window is found
    await settle();
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
  it("shows the player and its controls for a Resource without media", async () => {
    await show(projectOf());

    expect(panel().hidden).toBe(false);
  });

  // @behavior PV-197
  it("plays silence a minute past the last Segment for a Resource without media", async () => {
    const silences = keepMadeSilence();

    await show(projectEndingAt(10000));

    expect([
      media().getAttribute("src"),
      silences[0].type,
      await silenceSeconds(silences[0]),
    ]).toEqual(["blob:silence-1", "audio/wav", 70]);
  });

  it("makes the silence of nothing but silent samples", async () => {
    const silences = keepMadeSilence();

    await show(projectEndingAt(10000));
    const samples = new Uint8Array(await silences[0].arrayBuffer(), 44);

    expect(samples.every((sample) => sample === 128)).toBe(true);
  });

  // @behavior PV-199
  it("lengthens the silence once a Segment reaches its end", async () => {
    const silences = keepMadeSilence();
    await show(projectEndingAt(10000));

    await show(projectEndingAt(70000));

    expect([silences.length, await silenceSeconds(silences[1])]).toEqual([
      2, 130,
    ]);
  });

  // @behavior PV-200
  it("stays at the same time as the silence lengthens", async () => {
    keepMadeSilence();
    startOverOnNewSource();
    await show(projectEndingAt(10000));
    media().currentTime = 5;

    await show(projectEndingAt(70000));

    expect(media().currentTime).toBe(5);
  });

  it("makes silence of its own for another Resource without media", async () => {
    const silences = keepMadeSilence();
    await show(projectEndingAt(10000));

    await show({ ...projectEndingAt(5000), current_resource: "ep02" });

    expect([silences.length, await silenceSeconds(silences[1])]).toEqual([
      2, 65,
    ]);
  });

  // @behavior PV-201
  it("keeps the silence while the Segments stay within it", async () => {
    const silences = keepMadeSilence();
    await show(projectEndingAt(10000));

    await show(projectEndingAt(30000));

    expect([silences.length, media().getAttribute("src")]).toEqual([
      1,
      "blob:silence-1",
    ]);
  });

  it("lets the silence go once the player reads a media file", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:silence");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    await show(projectOf());

    await show(projectWithMedia());

    expect(revoke).toHaveBeenCalledWith("blob:silence");
  });

  // @behavior PV-010
  it("shows the Dummy Video beside the controls for media without a picture", async () => {
    await show(projectWithMedia());

    loadPicture(0, 0);

    expect([screenOf().hidden, panel().hidden]).toEqual([false, false]);
  });

  it("sizes the row beside the card by the video's shape", async () => {
    await show(projectWithMedia());

    loadPicture(1920, 1080);

    expect([
      screenRow().hasAttribute("data-has-picture"),
      screenRow().style.getPropertyValue("--picture-ratio"),
    ]).toEqual([true, "0.5625"]);
  });

  it("sizes the row beside the card by a 16:9 Dummy Video for media without a picture", async () => {
    await show(projectWithMedia());

    loadPicture(0, 0);

    expect([
      screenRow().hasAttribute("data-has-picture"),
      screenRow().style.getPropertyValue("--picture-ratio"),
    ]).toEqual([true, "0.5625"]);
  });

  // @behavior PV-011
  it("puts a hint in the video's place when the media cannot be played", async () => {
    await show(projectWithMedia());

    media().dispatchEvent(new Event("error"));

    expect([media().hidden, hint().hidden]).toEqual([true, false]);
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

    expect(clock().textContent).toBe("01:02 / 24:10");
  });

  // @behavior PV-014
  it("shows the hours of media lasting an hour or more", async () => {
    await show(projectWithMedia());

    playTo(62, 60 * 60 + 2 * 60 + 5);

    expect(clock().textContent).toBe("01:02 / 1:02:05");
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

    expect(caption().textContent).toBe("今天");
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

      expect(caption().textContent).toBe("對啊\n大家好");
    });

    // @behavior PV-104
    it("keeps the Segment it overlapped over the video once it ends", async () => {
      await show(overlappingProject());

      playTo(1.8);

      expect(caption().textContent).toBe("大家好");
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

      expect(caption().textContent).toBe("對啊\n大家好");
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

    expect(caption().textContent).toBe("今天");
  });

  // @behavior PV-016
  it("shows nothing over the video between Segments", async () => {
    await show(
      projectWithMedia({
        segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }],
      }),
    );

    playTo(1.5);

    expect(caption().textContent).toBe("");
  });

  // @behavior PV-043
  it("shows the translation shown over the video once it is chosen", async () => {
    await show(projectTranslated());

    captionLanguage("translation").click();
    playTo(0.5);

    expect(caption().textContent).toBe("Today");
  });

  // @behavior PV-211
  it("shows the language chosen over the video at once while a Segment is shown", async () => {
    await show(projectTranslated());
    playTo(0.5);

    captionLanguage("translation").click();
    flushSync();

    expect(caption().textContent).toBe("Today");
  });

  // @behavior PV-044
  it("shows both languages over the video with the original first", async () => {
    await show(projectTranslated());

    captionLanguage("bilingual").click();
    playTo(0.5);

    expect(caption().textContent).toBe("今天\nToday");
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

    expect(caption().textContent).toBe("Today\n今天");
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

    expect(caption().textContent).toBe("今天");
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
    await reopen();

    await show(projectTranslated({ media: "/talks/ep02.mp4" }));

    expect(captionLanguage("bilingual").checked).toBe(true);
  });

  // @behavior PV-049
  it("offers the choice over the Dummy Video for media without a picture", async () => {
    await show(projectTranslated());

    loadPicture(0, 0);

    expect(
      screen.queryByRole("radiogroup", { name: t("preview.captionLanguage") }),
    ).not.toBeNull();
  });

  // @behavior PV-193
  it("shows the Dummy Video in black by default", async () => {
    await show(projectWithMedia());

    loadPicture(0, 0);

    expect(screenOf().dataset.dummyVideo).toBe("black");
  });

  // @behavior PV-194
  it("shows the Dummy Video in the colour chosen", async () => {
    await show(projectWithMedia());
    loadPicture(0, 0);

    dummyVideoColour("white").click();
    flushSync();

    expect(screenOf().dataset.dummyVideo).toBe("white");
  });

  // @behavior PV-195
  it("keeps the Dummy Video's colour for the next Resource", async () => {
    await show(projectWithMedia());
    loadPicture(0, 0);
    dummyVideoColour("white").click();
    delete screenOf().dataset.dummyVideo;
    dummyVideoColour("black").checked = true;
    await reopen();

    await show(projectOf({ media: "/talks/ep02.m4a" }));
    loadPicture(0, 0);

    expect([
      screenOf().dataset.dummyVideo,
      dummyVideoColour("white").checked,
    ]).toEqual(["white", true]);
  });

  // @behavior PV-196
  it("leaves the Dummy Video's colour unchosen for media with a picture", async () => {
    await show(projectWithMedia());

    loadPicture(1920, 1080);

    expect([
      screenOf().dataset.dummyVideo,
      dummyVideoColour("black").disabled,
      dummyVideoColour("white").disabled,
    ]).toEqual([undefined, true, true]);
  });

  // @behavior PV-068
  it("shows what is over the video on a translucent black by default", async () => {
    await show(projectWithMedia());

    expect(caption().dataset.backdrop).toBe("translucent");
  });

  // @behavior PV-069
  it("shows what is over the video on the backdrop chosen", async () => {
    await show(projectWithMedia());

    captionBackdrop("opaque").click();
    flushSync();

    expect(caption().dataset.backdrop).toBe("opaque");
  });

  // @behavior PV-070
  it("keeps the backdrop over the video for the next Resource", async () => {
    await show(projectWithMedia());
    captionBackdrop("none").click();
    await reopen();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect([
      caption().dataset.backdrop,
      captionBackdrop("none").checked,
    ]).toEqual(["none", true]);
  });

  // @behavior PV-092
  it("names the Speaker over the video by default", async () => {
    await show(projectSpoken());

    playTo(0.5);

    expect([caption().textContent, captionSpeaker().checked]).toEqual([
      "小明: 今天",
      true,
    ]);
  });

  // @behavior PV-093
  it("names the Speaker in the translation over the video as the Translation Glossary does", async () => {
    await show(projectSpoken());

    captionLanguage("translation").click();
    playTo(0.5);

    expect(caption().textContent).toBe("Xiao Ming: Today");
  });

  it("keeps a Speaker's name the Translation Glossary does not give over the translation", async () => {
    await show(projectSpoken({ shown_speaker_names: {} }));

    captionLanguage("translation").click();
    playTo(0.5);

    expect(caption().textContent).toBe("小明: Today");
  });

  // @behavior PV-094
  it("names the Speaker in both languages over the video", async () => {
    await show(projectSpoken());

    captionLanguage("bilingual").click();
    playTo(0.5);

    expect(caption().textContent).toBe("小明: 今天\nXiao Ming: Today");
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

    expect(caption().textContent).toBe("小華: 對啊\n小明: 大家好");
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

    expect(caption().textContent).toBe("小明: 今天\n天氣好");
  });

  // @behavior PV-095
  it("shows the text alone over the video once the Speaker is turned off", async () => {
    await show(projectSpoken());

    captionSpeaker().click();
    playTo(0.5);

    expect(caption().textContent).toBe("今天");
  });

  // @behavior PV-212
  it("takes the Speaker off what is over the video at once while a Segment is shown", async () => {
    await show(projectSpoken());
    playTo(0.5);

    captionSpeaker().click();
    flushSync();

    expect(caption().textContent).toBe("今天");
  });

  // @behavior PV-096
  it("keeps the Speaker over the video off for the next Resource", async () => {
    await show(projectSpoken());
    captionSpeaker().click();
    await reopen();

    await show(projectSpoken({ media: "/talks/ep02.mp4" }));
    playTo(0.5);

    expect([caption().textContent, captionSpeaker().checked]).toEqual([
      "今天",
      false,
    ]);
  });

  function foldPlayer(): void {
    button("preview.foldPlayer").click();
    flushSync();
  }

  function foldTimeline(): void {
    button("preview.foldTimeline").click();
    flushSync();
  }

  // @behavior PV-034
  it("hides the player and its controls, keeping the timeline, when their fold button is pressed", async () => {
    await show(projectWithMedia());

    foldPlayer();

    expect([
      screenRow().hidden,
      timelineFrame().hidden,
      panel().hidden,
    ]).toEqual([true, false, false]);
  });

  it("lights the fold buttons of the parts folded away", async () => {
    await show(projectWithMedia());

    foldTimeline();

    const isLit = (label: string) => {
      const fold = button(label);
      return [
        fold.classList.contains("btn-primary"),
        fold.getAttribute("aria-pressed"),
      ];
    };
    expect([
      isLit("preview.foldPlayer"),
      isLit("preview.foldTimeline"),
    ]).toEqual([
      [false, "false"],
      [true, "true"],
    ]);
  });

  // @behavior PV-035
  it("keeps the player folded for the next Resource with media", async () => {
    await show(projectWithMedia());
    foldPlayer();
    await reopen();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(screenRow().hidden).toBe(true);
  });

  // @behavior PV-189
  it("hides the timeline, keeping the player and its controls, when its fold button is pressed", async () => {
    await show(projectWithMedia());

    foldTimeline();

    expect([timelineFrame().hidden, screenRow().hidden]).toEqual([true, false]);
  });

  // @behavior PV-190
  it("keeps the timeline folded for the next Resource with media", async () => {
    await show(projectWithMedia());
    foldTimeline();
    await reopen();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(timelineFrame().hidden).toBe(true);
  });

  // @behavior PV-191
  it("takes no room once both the player and the timeline are folded", async () => {
    await show(projectWithMedia());
    foldPlayer();

    foldTimeline();

    expect(panel().hidden).toBe(true);
  });

  const volumeSlider = () =>
    screen.getByRole<HTMLInputElement>("slider", { name: t("preview.volume") });

  function moveVolumeSlider(value: number): void {
    volumeSlider().value = String(value);
    volumeSlider().dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
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

  // @behavior PV-166
  it("keeps the volume chosen for the next time the Preview opens", async () => {
    await show(projectWithMedia());
    moveVolumeSlider(25);

    await reopen();

    expect([volumeSlider().value, player.volume]).toEqual(["25", 0.125]);
  });

  const pressMute = () => button("preview.mute").click();

  // @behavior PV-179
  it("reads the volume beside its slider", async () => {
    await show(projectWithMedia());

    moveVolumeSlider(30);

    expect(volumeSlider().nextElementSibling!.textContent).toBe("22%");
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
    await show(projectWithMedia());
    moveVolumeSlider(25);
    pressMute();

    await reopen();

    expect(player.volume).toBe(0.125);
  });

  // @behavior PV-173
  it("reads the media with anonymous CORS", async () => {
    await reopen();

    expect(player.crossOrigin).toBe("anonymous");
  });

  describe("above full volume", () => {
    /** The Web Audio contexts silences, each with the nodes the player is routed through. */
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

    // @behavior LY-005
    it("shows only the controls, without the Current Segment's card, while the video is away", async () => {
      await show(projectWithMedia());

      pressVideoWindowButton();

      expect(isCardShown()).toBe(false);
    });

    it("leaves the row beside the card to the card while the video is away", async () => {
      await show(projectWithMedia());
      loadPicture(1920, 1080);

      pressVideoWindowButton();

      expect(screenRow().hasAttribute("data-has-picture")).toBe(false);
    });

    it("sizes the row beside the card by the video again as it comes back", async () => {
      await show(projectWithMedia());
      loadPicture(1920, 1080);
      pressVideoWindowButton();

      pressVideoWindowButton();

      expect(screenRow().hasAttribute("data-has-picture")).toBe(true);
    });

    // @behavior LY-006
    it("shows the Current Segment's card again as the video comes back", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();

      pressVideoWindowButton();

      expect(isCardShown()).toBe(true);
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

      expect(caption().textContent).toBe("今天");
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
    it("keeps the Video Window with the Dummy Video for media without a picture", async () => {
      await show(projectWithMedia());
      pressVideoWindowButton();
      await show(projectWithMedia({ media: "/talks/ep02.m4a" }));

      loadPicture(0, 0);
      await settle();

      expect([
        media().ownerDocument === videoWindow()?.document,
        windowCalls,
      ]).toEqual([true, []]);
    });
  });

  describe("on macOS", () => {
    /** Runs as macOS, drawing the Preview again so it reads the platform as it starts. */
    beforeEach(async () => {
      Object.assign(window, {
        __TAURI_OS_PLUGIN_INTERNALS__: { platform: "macos" },
      });
      cleanup();
      await draw();
    });

    afterEach(() => {
      Object.assign(window, {
        __TAURI_OS_PLUGIN_INTERNALS__: { platform: "linux" },
      });
    });

    // @behavior PV-091
    it("names F9 and F12 as the keys that set times", async () => {
      await show(
        projectWithMedia({
          segments: [{ start_ms: 0, end_ms: 1000, text: "今天" }],
        }),
      );

      session.makeCurrent(0);
      flushSync();

      const keys = [
        ...screen
          .getByText(t("preview.setTimes"))
          .parentElement!.querySelectorAll("kbd"),
      ].map((key) => key.textContent);
      expect(keys).toEqual(["F9", "F12"]);
    });
  });
});
