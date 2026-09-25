// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
        <button id="fold" data-preview-target="fold" data-action="preview#toggleFold" hidden><span data-preview-target="foldIcon"></span></button>
        <div data-preview-target="panel" hidden>
        <div data-preview-target="screen">
          <video data-preview-target="media" data-action="loadedmetadata->preview#measure durationchange->preview#showTime timeupdate->preview#follow play->preview#showPlaying pause->preview#showPaused error->preview#showUnplayable"></video>
          <p data-preview-target="caption"></p>
          <div data-preview-target="hint" hidden></div>
        </div>
        <button id="play" data-action="preview#togglePlayback"><span data-preview-target="playback"></span></button>
        <span data-preview-target="time"></span>
          <p data-preview-target="currentEmpty"></p>
          <div data-preview-target="current" hidden><span data-preview-target="currentNumber"></span><span data-preview-target="currentTimes"></span><p data-preview-target="currentText"></p><p data-preview-target="currentTranslation"></p></div>
        </div>
      </div>
    `;
    application = Application.start();
    application.register("preview", PreviewController);
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
    application.register("preview", PreviewController);
    await settle();

    await show(projectOf({ media: "/talks/ep02.mp4" }));

    expect(panel().hidden).toBe(true);
  });
});
