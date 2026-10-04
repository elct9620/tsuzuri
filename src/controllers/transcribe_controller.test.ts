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
import SegmentChangesController from "./segment_changes_controller";
import TranscribeController from "./transcribe_controller";
import TranscriptController from "./transcript_controller";
import TranslationOptionsController from "./translation_options_controller";

describe("TranscribeController", () => {
  let application: Application;
  let project: ProjectView | null;
  let transcription: () => Promise<unknown>;
  let translation: () => Promise<unknown>;
  let translateArgs: unknown;
  let transcribeArgs: unknown;
  let isCancelAsked: boolean;
  let commandsSent: string[];

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
    target("openButton").click();
    await settle();
    target("startButton").click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    transcription = () => new Promise(() => {});
    translation = async () => ({ phases: [], unmatched_count: 0 });
    translateArgs = undefined;
    transcribeArgs = undefined;
    isCancelAsked = false;
    commandsSent = [];
    document.body.innerHTML = `
      ${translationOptionsTemplate}
      <div data-controller="transcribe" data-transcribe-progress-outlet="#progress"
        data-action="translation-options:overwrite->transcribe#followTranslation segment-changes:retranscribe@window->transcribe#openForScope"
        data-transcribe-translation-options-outlet="#transcribe-options">
        <button data-transcribe-target="openButton" data-action="transcribe#open" disabled>轉錄</button>
        <dialog data-transcribe-target="dialog">
          <h3 data-transcribe-target="title"></h3>
          <p data-transcribe-target="scopeField" hidden><span data-transcribe-target="scope"></span></p>
          <span data-transcribe-target="language"></span>
          <span data-transcribe-target="model"></span>
          <label data-transcribe-target="diarizationChoice">
            <input type="checkbox" data-transcribe-target="diarizationToggle" />
          </label>
          <label data-transcribe-target="translationChoice">
            <input type="checkbox" data-transcribe-target="translationToggle"
              data-action="transcribe#showTranslationOptions">
          </label>
          <fieldset id="transcribe-options" data-controller="translation-options" hidden></fieldset>
          <div data-transcribe-target="overwriteWarning" hidden>
            <span data-transcribe-target="overwriteMessage"></span>
          </div>
          <button data-transcribe-target="startButton" data-action="transcribe#start">開始</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" data-action="rust:pipeline-progress@window->progress#show" hidden>
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
        commandsSent.push(command);
        if (command === "current_project") return project;
        if (command === "cancel_task") isCancelAsked = true;
        if (command === "diarize")
          return { audio_seconds: 60, diarize_seconds: 4, phases: [] };
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

  /** The task commands sent, in order. */
  const tasksSent = () =>
    commandsSent.filter((command) =>
      ["transcribe", "diarize", "translate"].includes(command),
    );

  // @behavior DZ-018
  it("diarizes once transcribed, before translating", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
      written_span: null,
    });
    target("openButton").click();
    await settle();
    target<HTMLInputElement>("diarizationToggle").checked = true;
    target<HTMLInputElement>("translationToggle").checked = true;

    target("startButton").click();
    await settle();
    await settle();

    expect(tasksSent()).toEqual(["transcribe", "diarize", "translate"]);
  });

  // @behavior DZ-019
  it("asks to diarize once transcribed as the Project chooses", async () => {
    const asked = async (isChosen: boolean) => {
      await hold({
        ...media,
        options: {
          ...media.options,
          is_diarized_after_transcription: isChosen,
        },
      });
      target("openButton").click();
      await settle();
      const isChecked = target<HTMLInputElement>("diarizationToggle").checked;
      target<HTMLDialogElement>("dialog").close();
      return isChecked;
    };

    expect([await asked(false), await asked(true)]).toEqual([false, true]);
  });

  // @behavior DZ-020
  it("leaves a transcription within an Audio Window undiarized", async () => {
    await hold({
      ...media,
      options: { ...media.options, is_diarized_after_transcription: true },
    });

    window.dispatchEvent(
      new CustomEvent("segment-changes:retranscribe", {
        detail: { scope: { kind: "rest", first: 0 } },
      }),
    );
    await settle();

    expect([
      target("diarizationChoice").hidden,
      target<HTMLInputElement>("diarizationToggle").checked,
    ]).toEqual([true, false]);
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
    target<HTMLInputElement>("translationToggle").checked = true;

    await start();

    expect(steps()).toEqual([
      "○準備元件",
      "○載入模型",
      "○找出被切開的句子",
      "○翻譯",
    ]);
  });

  // @behavior TL-097
  it("starts no transcription to translate while the summary has no word limit", async () => {
    await hold(media);
    target<HTMLInputElement>("translationToggle").checked = true;
    translationOption<HTMLInputElement>(
      "#transcribe-options",
      "summary",
    ).checked = true;
    translationOption<HTMLInputElement>(
      "#transcribe-options",
      "summaryWords",
    ).value = "";

    await start();

    expect(transcribeArgs).toBeUndefined();
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

  // @behavior TX-055
  it("leaves out the real-time factor of no audio", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 0,
      transcribe_seconds: 1,
      phases: [],
    });

    await start();

    expect(notificationItems(0).map(([name]) => name)).not.toContain(
      "即時倍率（RTF）",
    );
  });

  // @behavior TX-061
  it("lists the real-time factor", async () => {
    await hold(media);
    transcription = async () => ({
      audio_seconds: 60,
      transcribe_seconds: 30,
      phases: [],
    });

    await start();

    expect(notificationItems(0)).toContainEqual(["即時倍率（RTF）", "0.50"]);
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
    target<HTMLInputElement>("translationToggle").checked = true;

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
    target<HTMLInputElement>("translationToggle").checked = true;

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
    target<HTMLInputElement>("translationToggle").checked = true;
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

  // @behavior TX-041
  it("names the Project Model in the transcribe dialog", async () => {
    await hold({
      ...media,
      options: {
        ...media.options,
        models: {
          transcription: { kind: "file", path: "/models/kotoba.bin" },
          translation: null,
        },
      },
    });

    target("openButton").click();
    await settle();

    expect(target("model").textContent).toBe("kotoba.bin");
  });

  // @behavior TX-024
  it("shows the translation options once translating afterwards is chosen", async () => {
    await hold(media);
    target("openButton").click();
    await settle();

    target<HTMLInputElement>("translationToggle").click();

    expect(
      document.querySelector<HTMLElement>("#transcribe-options")!.hidden,
    ).toBe(false);
  });

  /** What the dialog warns of, or null when it warns of nothing, and what its start button reads. */
  const warning = () => [
    target("overwriteWarning").hidden
      ? null
      : target("overwriteMessage").textContent,
    target("startButton").textContent,
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
    target("openButton").click();
    await settle();

    target<HTMLInputElement>("translationToggle").click();

    expect(warning()).toEqual([
      "這個語言的譯文已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-030
  it("warns once of both the subtitle and the translation it overwrites", async () => {
    await hold(translatedIntoEnglish(true));
    target("openButton").click();
    await settle();

    target<HTMLInputElement>("translationToggle").click();

    expect(warning()).toEqual([
      "字幕與這個語言的譯文都已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-031
  it("stops warning of a translation it will not make", async () => {
    await hold(translatedIntoEnglish(false));
    target("openButton").click();
    await settle();
    const translate = target<HTMLInputElement>("translationToggle");
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
      "這個資源沒有影片或音訊",
    ]);
  });

  // @behavior TX-021
  it("cannot start transcribing a Resource without a media file", async () => {
    await hold(projectOf());

    expect(target<HTMLButtonElement>("openButton").disabled).toBe(true);
  });

  // @behavior TX-022
  it("warns before overwriting a subtitle and asks to overwrite it", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: true })],
      }),
    );

    await start();

    expect([target("overwriteWarning").hidden, transcribeArgs]).toEqual([
      false,
      { overwrite: true, scope: { kind: "whole" } },
    ]);
  });

  describe("transcribing again from the editor", () => {
    let retranslateArgs: unknown;

    const rows = () => [
      ...document.querySelectorAll<HTMLLIElement>("#list > li"),
    ];

    /** Three Segments of a Resource with a media file, showing the `en` translation when `isTranslationShown`. */
    function projectWithMedia(isTranslationShown = false): ProjectView {
      return projectOf({
        resources: [
          resourceOf({
            has_media: true,
            translation_languages: isTranslationShown ? ["en"] : [],
          }),
        ],
        shown_translation: isTranslationShown ? "en" : null,
        segments: ["大家好", "資料不上傳", "謝謝"].map((text, at) => ({
          start_ms: at * 5000,
          end_ms: at * 5000 + 4000,
          text,
          ...(isTranslationShown ? { translation: text } : {}),
        })),
      });
    }

    function checkRows(...indexes: number[]): void {
      for (const index of indexes) {
        const checkbox =
          rows()[index].querySelector<HTMLInputElement>("input.check")!;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    async function startFromDialog(): Promise<void> {
      target("startButton").click();
      await settle();
    }

    beforeEach(async () => {
      application.stop();
      retranslateArgs = undefined;
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<section data-controller="transcript segment-changes"
          data-action="selectionchange@document->transcript#followSelection transcript:shown->segment-changes#followTasks editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked">
          <h2 data-transcript-target="heading"></h2>
          <select data-transcript-target="translationLanguage"></select>
          <p data-transcript-target="emptyHint"></p>
          <div data-segment-changes-target="checkedBar" hidden>
            <span data-segment-changes-target="checkedCount"></span>
            <button data-segment-changes-target="mergeButton"></button>
            <button data-segment-changes-target="retranslateButton"></button>
            <button id="retranscribe-checked" data-segment-changes-target="retranscribeButton"
              data-action="segment-changes#retranscribe">重新轉錄</button>
          </div>
          <ol id="list" data-transcript-target="list"></ol>
        </section>`,
      );
      document
        .querySelector('[data-controller="transcribe"]')!
        .setAttribute(
          "data-action",
          "translation-options:overwrite->transcribe#followTranslation segment-changes:retranscribe@window->transcribe#openForScope",
        );
      mockIPC(
        (command, args) => {
          if (command === "current_project") return project;
          if (command === "model_settings")
            return { transcription: { path: "/models/breeze.bin" } };
          if (command === "transcribe") {
            transcribeArgs = args;
            return transcription();
          }
          if (command === "retranslate") {
            retranslateArgs = args;
            return translation();
          }
        },
        { shouldMockEvents: true },
      );
      application = Application.start();
      await assemble(application, {
        progress: ProgressController,
        transcript: TranscriptController,
        "segment-changes": SegmentChangesController,
        transcribe: TranscribeController,
        "translation-options": TranslationOptionsController,
      }).start();
      await settle();
    });

    // @behavior TX-048
    it("transcribes again from a Segment's menu", async () => {
      await hold(projectWithMedia());

      rows()[1]
        .querySelector<HTMLButtonElement>("button.retranscribe")!
        .click();
      await settle();
      await startFromDialog();

      expect([
        target("scope").textContent,
        target("overwriteWarning").hidden,
        transcribeArgs,
      ]).toEqual([
        "從 00:00:05.000 以下",
        false,
        { overwrite: true, scope: { kind: "rest", first: 1 } },
      ]);
    });

    // @behavior TX-049
    it("transcribes the Checked Segments again", async () => {
      await hold(projectWithMedia());
      checkRows(0, 2);

      document
        .querySelector<HTMLButtonElement>("#retranscribe-checked")!
        .click();
      await settle();
      await startFromDialog();

      expect(transcribeArgs).toEqual({
        overwrite: true,
        scope: { kind: "span", first: 0, last: 2 },
      });
    });

    // @behavior TX-050
    it("translates afterwards only what a transcription from a Segment wrote", async () => {
      await hold(projectWithMedia(true));
      transcription = async () => ({
        audio_seconds: 10,
        transcribe_seconds: 2,
        phases: [],
        written_span: { first: 1, last: 2 },
      });
      rows()[1]
        .querySelector<HTMLButtonElement>("button.retranscribe")!
        .click();
      await settle();
      target<HTMLInputElement>("translationToggle").click();

      await startFromDialog();
      await settle();

      expect(retranslateArgs).toMatchObject({ indexes: [1, 2] });
    });

    // @behavior TX-051
    it("offers no transcribing again without a media file", async () => {
      await hold({
        ...projectWithMedia(),
        resources: [resourceOf({ has_media: false })],
      });
      checkRows(0);
      await settle();

      expect([
        rows()[0].querySelector("button.retranscribe")!.closest("li")!.hidden,
        document.querySelector<HTMLButtonElement>("#retranscribe-checked")!
          .hidden,
      ]).toEqual([true, true]);
    });

    // @behavior TX-052
    it("offers translating afterwards only into the translation shown", async () => {
      await hold(projectWithMedia());

      rows()[1]
        .querySelector<HTMLButtonElement>("button.retranscribe")!
        .click();
      await settle();

      expect(target("translationChoice").hidden).toBe(true);
    });
  });
});
