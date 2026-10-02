// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import {
  NOTIFICATION_STACK,
  notificationItems,
  notifications,
} from "../ui/test_notification";
import DiarizeController from "./diarize_controller";
import ProgressController from "./progress_controller";

describe("DiarizeController", () => {
  let application: Application;
  let commandsSent: string[];
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-diarize-target="${name}"]`)!;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function openDialog(): Promise<void> {
    target("openButton").click();
    await settle();
  }

  const resourceWithMedia = projectOf({
    resources: [resourceOf({ has_media: true })],
  });
  const segment = (speaker: string | null) => ({
    start_ms: 0,
    end_ms: 1000,
    text: "大家好",
    ...(speaker === null ? {} : { speaker }),
  });

  beforeEach(async () => {
    project = null;
    commandsSent = [];
    document.body.innerHTML = `
      <div data-controller="diarize" data-diarize-progress-outlet="#progress">
        <button data-diarize-target="openButton" data-action="diarize#open" disabled>辨識</button>
        <dialog data-diarize-target="dialog">
          <span data-diarize-target="model"></span>
          <div data-diarize-target="overwriteWarning" hidden></div>
          <button data-diarize-target="startButton" data-action="diarize#start">開始辨識</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" data-action="rust:pipeline-progress@window->progress#show" hidden>
        <span data-progress-target="summary"></span>
        <ul data-progress-target="steps"></ul>
        <p data-progress-target="status"></p>
        <progress max="100" data-progress-target="bar" hidden></progress>
      </div>
      ${NOTIFICATION_STACK}
    `;
    mockIPC(
      (command) => {
        commandsSent.push(command);
        if (command === "current_project") return project;
        if (command === "model_settings")
          return {
            diarization: {
              source: {
                kind: "file",
                path: "/models/Nemotron-3-Diarization.q8_0.gguf",
              },
            },
          };
        if (command === "diarize")
          return {
            audio_seconds: 60,
            diarize_seconds: 4,
            phases: [
              { phase: "prepare", seconds: 0.01 },
              { phase: "convert", seconds: 0.3 },
              { phase: "load", seconds: 0.5 },
              { phase: "diarize", seconds: 3.2 },
            ],
          };
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    await assemble(application, {
      diarize: DiarizeController,
      progress: ProgressController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior DZ-015
  it("diarizes the Current Resource from the toolbar", async () => {
    await hold(resourceWithMedia);
    await openDialog();

    target("startButton").click();
    await settle();

    expect([
      commandsSent.includes("diarize"),
      notifications(),
      notificationItems(0)[0],
    ]).toEqual([true, ["說話者辨識完成"], ["音檔長度", "60.0 秒"]]);
  });

  // @behavior DZ-016
  it("offers a diarization only with a media file and a subtitle", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: false })],
      }),
    );
    const isWithoutSubtitleDisabled =
      target<HTMLButtonElement>("openButton").disabled;

    await hold(resourceWithMedia);

    expect([
      isWithoutSubtitleDisabled,
      target<HTMLButtonElement>("openButton").disabled,
    ]).toEqual([true, false]);
  });

  // @behavior DZ-017
  it("warns that a diarization replaces the Speakers given", async () => {
    await hold({ ...resourceWithMedia, segments: [segment("co")] });

    await openDialog();

    expect([
      target("overwriteWarning").hidden,
      target("startButton").textContent,
    ]).toEqual([false, "覆蓋並開始"]);
  });

  it("starts without a warning when no Segment carries a Speaker", async () => {
    await hold({ ...resourceWithMedia, segments: [segment(null)] });

    await openDialog();

    expect([
      target("overwriteWarning").hidden,
      target("startButton").textContent,
    ]).toEqual([true, "開始辨識"]);
  });

  it("names the diarization Model it runs with", async () => {
    await hold(resourceWithMedia);

    await openDialog();

    expect(target("model").textContent).toBe(
      "Nemotron-3-Diarization.q8_0.gguf",
    );
  });
});
