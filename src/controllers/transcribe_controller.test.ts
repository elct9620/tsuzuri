// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../project";
import { projectOf, resourceOf } from "../test_project";
import {
  translationOption,
  translationOptionsTemplate,
} from "../test_translation_options";
import ProgressController from "./progress_controller";
import TranscribeController from "./transcribe_controller";
import TranslationOptionsController from "./translation_options_controller";

describe("TranscribeController", () => {
  let application: Application;
  let project: ProjectView | null;
  let transcription: () => Promise<unknown>;
  let translateArgs: unknown;
  let transcribeArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-transcribe-target="${name}"]`)!;
  const status = () =>
    document.querySelector('[data-progress-target="status"]')!.textContent;
  const bar = () =>
    document.querySelector<HTMLProgressElement>(
      '[data-progress-target="bar"]',
    )!;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  const media = projectOf({
    resources: [resourceOf({ has_media: true, has_subtitle: false })],
  });

  async function start(): Promise<void> {
    target("open").click();
    await settle();
    target("start").click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    transcription = () => new Promise(() => {});
    translateArgs = undefined;
    transcribeArgs = undefined;
    document.body.innerHTML = `
      ${translationOptionsTemplate}
      <div data-controller="transcribe" data-transcribe-progress-outlet="#progress"
        data-transcribe-translation-options-outlet="#transcribe-options">
        <button data-transcribe-target="open" data-action="transcribe#open" disabled>轉錄</button>
        <dialog data-transcribe-target="dialog">
          <span data-transcribe-target="language"></span>
          <span data-transcribe-target="model"></span>
          <input type="checkbox" data-transcribe-target="translate"
            data-action="transcribe#showTranslationOptions">
          <fieldset id="transcribe-options" data-controller="translation-options" hidden></fieldset>
          <div data-transcribe-target="overwrite" hidden>字幕已存在</div>
          <button data-transcribe-target="start" data-action="transcribe#start">開始</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" hidden>
        <p data-progress-target="status"></p>
        <progress max="100" data-progress-target="bar" hidden></progress>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "model_settings")
          return { transcription: { path: "/models/breeze.bin" } };
        if (command === "transcribe") {
          transcribeArgs = args;
          return transcription();
        }
        if (command === "translate") {
          translateArgs = args;
          return { phases: [] };
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("progress", ProgressController);
    application.register("transcribe", TranscribeController);
    application.register("translation-options", TranslationOptionsController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-007
  it("shows the Phase and its percentage in the editor", async () => {
    await hold(media);
    await start();

    await emit("pipeline-progress", { phase: "transcribe", percent: 42 });
    await settle();

    expect(status()).toBe("轉錄 42%");
  });

  // @behavior TX-010
  it("shows a Phase without a percentage as a bar with no value", async () => {
    await hold(media);
    await start();

    await emit("pipeline-progress", { phase: "load", percent: null });
    await settle();

    expect([bar().hidden, bar().hasAttribute("value")]).toEqual([false, false]);
  });

  // @behavior TX-011
  it("lists each Phase with its seconds once transcribed", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [
        { phase: "convert", seconds: 1.25 },
        { phase: "transcribe", seconds: 28 },
      ],
    });

    await start();

    expect(status()).toContain("轉檔 1.3 秒 · 轉錄 28.0 秒");
  });

  // @behavior TX-012
  it("translates the Current Resource once transcribed when asked", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });
    target<HTMLInputElement>("translate").checked = true;

    await start();

    expect(translateArgs).toMatchObject({ target: "ja" });
  });

  // @behavior TX-023
  it("translates with the dialog's translation options once transcribed", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });
    target<HTMLInputElement>("translate").checked = true;
    translationOption<HTMLInputElement>(
      "#transcribe-options",
      "selfReview",
    ).checked = true;

    await start();

    expect(translateArgs).toMatchObject({
      target: "ja",
      options: { has_self_review: true },
    });
  });

  // @behavior TX-024
  it("shows the translation options once translating afterwards is chosen", async () => {
    await hold(media);
    target("open").click();
    await settle();

    target<HTMLInputElement>("translate").click();

    expect(
      document.querySelector<HTMLElement>("#transcribe-options")!.hidden,
    ).toBe(false);
  });

  // @behavior TX-014
  it("shows why the transcription failed", async () => {
    await hold(media);
    transcription = () => Promise.reject({ code: "no-media" });

    await start();

    expect(status()).toBe("失敗：這個資源沒有可轉錄的影片或音訊");
  });

  // @behavior TX-021
  it("cannot start transcribing a Resource without a media file", async () => {
    await hold(projectOf());

    expect(target<HTMLButtonElement>("open").disabled).toBe(true);
  });

  // @behavior TX-022
  it("warns before overwriting a subtitle and asks to overwrite it", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: true })],
      }),
    );

    await start();

    expect([target("overwrite").hidden, transcribeArgs]).toEqual([
      false,
      { overwrite: true },
    ]);
  });
});
