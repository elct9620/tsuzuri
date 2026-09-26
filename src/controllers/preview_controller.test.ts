// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import PreviewController from "./preview_controller";

describe("PreviewController", () => {
  let application: Application;
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = (name: string) =>
    document.querySelector<HTMLElement>(`[data-preview-target="${name}"]`)!;
  const media = () => target("media") as HTMLVideoElement;
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

  function pressPlay(): void {
    document.querySelector<HTMLElement>("#play")!.click();
  }

  beforeEach(async () => {
    localStorage.clear();
    project = null;
    mockConvertFileSrc("macos");
    mockIPC((command) => (command === "current_project" ? project : null), {
      shouldMockEvents: true,
    });
    document.body.innerHTML = `
      <div data-controller="preview">
        <button id="fold" data-preview-target="foldButton" data-action="preview#toggleFold" hidden><span data-preview-target="foldIcon"></span></button>
        <div data-preview-target="panel" hidden>
        <div data-preview-target="screen">
          <video data-preview-target="media" data-action="loadedmetadata->preview#measure durationchange->preview#showTime timeupdate->preview#follow play->preview#showPlaying pause->preview#showPaused error->preview#showUnplayable"></video>
          <p data-preview-target="caption"></p>
          <div data-preview-target="hint" hidden></div>
        </div>
        <button id="play" data-action="preview#togglePlayback"><span data-preview-target="playbackIcon"></span></button>
        <span data-preview-target="time"></span>
        <div data-preview-target="captionChoice">
          <input type="radio" name="caption" value="original" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="caption" value="translation" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="caption" value="bilingual" data-preview-target="captionLanguage" data-action="preview#chooseCaptionLanguage">
          <input type="radio" name="backdrop" value="none" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="radio" name="backdrop" value="translucent" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="radio" name="backdrop" value="opaque" data-preview-target="captionBackdrop" data-action="preview#chooseCaptionBackdrop">
          <input type="checkbox" data-preview-target="captionSpeaker" data-action="preview#toggleCaptionSpeaker">
        </div>
          <p data-preview-target="currentHint"></p>
          <div data-preview-target="currentCard" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><span data-preview-target="currentSpeaker" hidden></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p></div>
        </div>
      </div>
    `;
    application = Application.start();
    await assemble(application, {
      preview: PreviewController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
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
    const overlapping = (
      segments = [
        { start_ms: 0, end_ms: 2000, text: "大家好" },
        { start_ms: 1000, end_ms: 1500, text: "對啊" },
      ],
    ) => projectWithMedia({ segments });

    // @behavior PV-103
    it("shows it over the video above the one it overlaps", async () => {
      await show(overlapping());

      playTo(1.2);

      expect(target("caption").textContent).toBe("對啊\n大家好");
    });

    // @behavior PV-104
    it("keeps the Segment it overlapped over the video once it ends", async () => {
      await show(overlapping());

      playTo(1.8);

      expect(target("caption").textContent).toBe("大家好");
    });

    // @behavior PV-105
    it("stacks Segments that start together in their order", async () => {
      await show(
        overlapping([
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
});
