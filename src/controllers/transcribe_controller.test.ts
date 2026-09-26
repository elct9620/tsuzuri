// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import {
  translationOption,
  translationOptionsTemplate,
} from "../test_translation_options";
import ProgressController from "./progress_controller";
import {
  NOTIFICATION_STACK,
  notificationDetail,
  notificationItems,
  notifications,
} from "../ui/test_notification";
import TranscribeController from "./transcribe_controller";
import TranslationOptionsController from "./translation_options_controller";

describe("TranscribeController", () => {
  let application: Application;
  let project: ProjectView | null;
  let transcription: () => Promise<unknown>;
  let translation: () => Promise<unknown>;
  let translateArgs: unknown;
  let transcribeArgs: unknown;
  let isCancelAsked: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-transcribe-target="${name}"]`)!;
  const status = () =>
    document.querySelector('[data-progress-target="status"]')!.textContent;
  /** Each listed Phase, marked ✓ once done, ◌ while it runs, ○ before it. */
  const steps = () =>
    [...document.querySelectorAll('[data-progress-target="steps"] > li')].map(
      (step) => {
        const mark =
          step.getAttribute("aria-current") === "step"
            ? "◌"
            : step.classList.contains("step-primary")
              ? "✓"
              : "○";
        return `${mark}${step.textContent}`;
      },
    );
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
    translation = async () => ({ phases: [] });
    translateArgs = undefined;
    transcribeArgs = undefined;
    isCancelAsked = false;
    document.body.innerHTML = `
      ${translationOptionsTemplate}
      <div data-controller="transcribe" data-transcribe-progress-outlet="#progress"
        data-action="translation-options:overwrite->transcribe#followTranslation"
        data-transcribe-translation-options-outlet="#transcribe-options">
        <button data-transcribe-target="open" data-action="transcribe#open" disabled>轉錄</button>
        <dialog data-transcribe-target="dialog">
          <span data-transcribe-target="language"></span>
          <span data-transcribe-target="model"></span>
          <input type="checkbox" data-transcribe-target="translate"
            data-action="transcribe#showTranslationOptions">
          <fieldset id="transcribe-options" data-controller="translation-options" hidden></fieldset>
          <div data-transcribe-target="overwrite" hidden>
            <span data-transcribe-target="overwriteMessage"></span>
          </div>
          <button data-transcribe-target="start" data-action="transcribe#start">開始</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" hidden>
        <span data-progress-target="summary"></span>
        <ul data-progress-target="steps"></ul>
        <p data-progress-target="status"></p>
        <progress max="100" data-progress-target="bar" hidden></progress>
        <button id="cancel-task" data-action="progress#cancel">取消任務</button>
      </div>
      ${NOTIFICATION_STACK}
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "cancel_task") isCancelAsked = true;
        if (command === "model_settings")
          return { transcription: { path: "/models/breeze.bin" } };
        if (command === "transcribe") {
          transcribeArgs = args;
          return transcription();
        }
        if (command === "translate") {
          translateArgs = args;
          return translation();
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    await assemble(application, {
      progress: ProgressController,
      transcribe: TranscribeController,
      "translation-options": TranslationOptionsController,
    }).start();
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

  // @behavior TX-028
  it("sums up the running Phase in the heading's progress button", async () => {
    await hold(media);
    await start();

    await emit("pipeline-progress", { phase: "transcribe", percent: 23 });
    await settle();

    expect(
      document.querySelector('[data-progress-target="summary"]')!.textContent,
    ).toBe("轉錄 23%");
  });

  // @behavior TX-027
  it("lists the Phases of a transcription, marking the ones reached", async () => {
    await hold(media);
    await start();

    await emit("pipeline-progress", { phase: "load", percent: null });
    await settle();

    expect(steps()).toEqual(["✓準備元件", "✓轉檔", "◌載入模型", "○轉錄"]);
  });

  // @behavior TL-066
  it("lists the Phases of the translation once a transcription goes on to it", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });
    translation = () => new Promise(() => {});
    target<HTMLInputElement>("translate").checked = true;

    await start();

    expect(steps()).toEqual([
      "○準備元件",
      "○載入模型",
      "○找出被切開的句子",
      "○翻譯",
    ]);
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

    expect(notificationItems(0)).toEqual(
      expect.arrayContaining([
        ["轉檔", "1.3 秒"],
        ["轉錄", "28.0 秒"],
      ]),
    );
  });

  // @behavior TX-025
  it("clears the progress once the transcription ends", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });

    await start();

    expect(document.querySelector<HTMLElement>("#progress")!.hidden).toBe(true);
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

  // @behavior TX-026
  it("says the transcription and its translation finished in Notifications of their own", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });
    target<HTMLInputElement>("translate").checked = true;

    await start();

    expect(notifications()).toEqual(["轉錄完成", "翻譯完成"]);
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

  /** What the dialog warns of, or null when it warns of nothing, and what its start button reads. */
  const warning = () => [
    target("overwrite").hidden ? null : target("overwriteMessage").textContent,
    target("start").textContent,
  ];

  const translatedIntoEnglish = (hasSubtitle: boolean) =>
    projectOf({
      resources: [
        resourceOf({
          has_media: true,
          has_subtitle: hasSubtitle,
          translation_languages: ["en"],
        }),
      ],
      translation_language: "en",
    });

  // @behavior TL-081
  it("warns of an overwritten translation when transcribing", async () => {
    await hold(translatedIntoEnglish(false));
    target("open").click();
    await settle();

    target<HTMLInputElement>("translate").click();

    expect(warning()).toEqual([
      "這個語言的譯文已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-030
  it("warns once of both the subtitle and the translation it overwrites", async () => {
    await hold(translatedIntoEnglish(true));
    target("open").click();
    await settle();

    target<HTMLInputElement>("translate").click();

    expect(warning()).toEqual([
      "字幕與這個語言的譯文都已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-031
  it("stops warning of a translation it will not make", async () => {
    await hold(translatedIntoEnglish(false));
    target("open").click();
    await settle();
    const translate = target<HTMLInputElement>("translate");
    translate.click();

    translate.click();

    expect(warning()).toEqual([null, "開始轉錄"]);
  });

  // @behavior TX-029
  it("cancels a transcription from its progress", async () => {
    await hold(media);
    let stop: (failure: unknown) => void = () => {};
    transcription = () => new Promise((_, reject) => (stop = reject));
    await start();

    document.querySelector<HTMLButtonElement>("#cancel-task")!.click();
    await settle();
    stop({ code: "mode-cancelled" });
    await settle();

    expect([isCancelAsked, notifications()]).toEqual([true, ["已取消轉錄"]]);
  });

  // @behavior TX-014
  it("shows why the transcription failed", async () => {
    await hold(media);
    transcription = () => Promise.reject({ code: "no-media" });

    await start();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["轉錄失敗"],
      "這個資源沒有可轉錄的影片或音訊",
    ]);
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
