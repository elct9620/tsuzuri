// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assemble } from "../assembly";
import { editingPort } from "../backend/editing";
import { ProjectFeed, type ProjectView } from "../backend/project";
import { EditingSession } from "../editor";
import { projectOf, resourceOf } from "../test-project";
import {
  showNotifications,
  notificationDetail,
  notificationItems,
  notifications,
} from "./test-notifications";
import { pageContext } from "./context";
import { TaskRun } from "./task-run.svelte";
import TaskProgress from "./TaskProgress.svelte";
import { progressSteps } from "./test-task-progress";
import { optionCheckbox, setSummaryWords } from "./test-translation-options";
import TranscriptionDialog from "./TranscriptionDialog.svelte";
import { renderWithToolbar } from "./test-toolbar";
import {
  checkedBarButton,
  drawSegmentList,
  rowList,
  segmentDialogsOf,
} from "./test-segment-rows";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const startButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { hidden: true, name: /開始/ });

/** A choice the transcribe dialog offers, or none while it is not offered. */
const choice = (name: string) =>
  screen.queryByRole<HTMLInputElement>("checkbox", { hidden: true, name });

/** Chooses to translate once transcribed, which shows the translation options. */
async function chooseTranslatingAfter(): Promise<void> {
  choice("完成後翻譯")!.click();
  await settle();
}

async function startFromDialog(): Promise<void> {
  startButton().click();
  await settle();
}

describe("TranscriptionDialog", () => {
  let feed: ProjectFeed;
  let run: TaskRun;
  let project: ProjectView | null;
  let transcription: () => Promise<unknown>;
  let translation: () => Promise<unknown>;
  let translateArgs: unknown;
  let transcribeArgs: unknown;
  let commandsSent: string[];

  const openButton = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "轉錄" });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await feed.refresh();
    await settle();
  }

  async function openDialog(): Promise<void> {
    openButton().click();
    await settle();
  }

  async function start(): Promise<void> {
    await openDialog();
    await startFromDialog();
  }

  const media = projectOf({
    resources: [resourceOf({ has_media: true, has_subtitle: false })],
  });
  const transcribed = async () => ({
    audio_seconds: 60,
    transcribe_seconds: 30,
    phases: [],
    written_span: null,
  });

  beforeEach(() => {
    project = null;
    transcription = () => new Promise(() => {});
    translation = async () => ({ phases: [], unmatched_count: 0 });
    translateArgs = undefined;
    transcribeArgs = undefined;
    commandsSent = [];
    showNotifications();
    mockIPC((command, args) => {
      commandsSent.push(command);
      if (command === "current_project") return project;
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
    });
    feed = new ProjectFeed();
    run = new TaskRun();
    const context = pageContext(feed, new EditingSession(editingPort), run);
    renderWithToolbar(TranscriptionDialog, "openTranscription", context);
    render(TaskProgress, { context });
  });

  afterEach(() => {
    clearMocks();
  });

  /** The task commands sent, in order. */
  const tasksSent = () =>
    commandsSent.filter((command) =>
      ["transcribe", "diarize", "translate"].includes(command),
    );

  /** What the dialog warns of, or null when it warns of nothing, and what its start button reads. */
  const warning = () => [
    screen.queryByRole("alert", { hidden: true })?.textContent?.trim() ?? null,
    startButton().textContent,
  ];

  // @behavior DZ-018
  it("diarizes once transcribed, before translating", async () => {
    await hold(media);
    transcription = transcribed;
    await openDialog();
    choice("完成後辨識說話者")!.click();
    await chooseTranslatingAfter();

    await startFromDialog();
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
      await openDialog();
      const isChecked = choice("完成後辨識說話者")!.checked;
      screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).close();
      return isChecked;
    };

    expect([await asked(false), await asked(true)]).toEqual([false, true]);
  });

  // @behavior TL-066
  it("lists the Phases of the translation once a transcription goes on to it", async () => {
    await hold(media);
    transcription = transcribed;
    translation = () => new Promise(() => {});
    await openDialog();
    await chooseTranslatingAfter();

    await startFromDialog();

    expect(progressSteps()).toEqual([
      "○準備元件",
      "○載入模型",
      "○找出被切開的句子",
      "○翻譯",
    ]);
  });

  // @behavior TL-097
  it("starts no transcription to translate while the summary has no word limit", async () => {
    await hold(media);
    await openDialog();
    await chooseTranslatingAfter();
    optionCheckbox(/滾動摘要/)!.click();
    setSummaryWords("");

    await startFromDialog();

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
    transcription = transcribed;

    await start();

    expect(notificationItems(0)).toContainEqual(["即時倍率（RTF）", "0.50"]);
  });

  // @behavior TX-012
  it("translates the Current Resource once transcribed when asked", async () => {
    await hold(media);
    transcription = transcribed;
    await openDialog();
    await chooseTranslatingAfter();

    await startFromDialog();

    expect(translateArgs).toMatchObject({ target: "en" });
  });

  // @behavior TX-026
  it("says the transcription and its translation finished in Notifications of their own", async () => {
    await hold(media);
    transcription = transcribed;
    await openDialog();
    await chooseTranslatingAfter();

    await startFromDialog();

    expect(notifications()).toEqual(["轉錄完成", "翻譯完成"]);
  });

  // @behavior TX-023
  it("translates with the dialog's translation options once transcribed", async () => {
    await hold(media);
    transcription = transcribed;
    await openDialog();
    await chooseTranslatingAfter();
    optionCheckbox("自我檢查")!.click();

    await startFromDialog();

    expect(translateArgs).toMatchObject({
      target: "en",
      options: { has_self_review: true },
    });
  });

  // @behavior TX-063
  it("keeps the translation options through unchecking translating afterwards", async () => {
    await hold(media);
    transcription = transcribed;
    await openDialog();
    await chooseTranslatingAfter();
    optionCheckbox("自我檢查")!.click();

    await chooseTranslatingAfter();
    await chooseTranslatingAfter();
    await startFromDialog();

    expect(translateArgs).toMatchObject({ options: { has_self_review: true } });
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

    await openDialog();

    expect(screen.getByText("kotoba.bin")).not.toBeNull();
  });

  // @behavior TX-024
  it("shows the translation options once translating afterwards is chosen", async () => {
    await hold(media);
    await openDialog();
    const isShownBefore = optionCheckbox("自我檢查") !== null;

    await chooseTranslatingAfter();

    expect([isShownBefore, optionCheckbox("自我檢查") !== null]).toEqual([
      false,
      true,
    ]);
  });

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
    await openDialog();

    await chooseTranslatingAfter();

    expect(warning()).toEqual([
      "這個語言的譯文已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-030
  it("warns once of both the subtitle and the translation it overwrites", async () => {
    await hold(translatedIntoEnglish(true));
    await openDialog();

    await chooseTranslatingAfter();

    expect(warning()).toEqual([
      "字幕與這個語言的譯文都已存在，開始後會覆蓋",
      "覆蓋並開始",
    ]);
  });

  // @behavior TX-031
  it("stops warning of a translation it will not make", async () => {
    await hold(translatedIntoEnglish(false));
    await openDialog();
    await chooseTranslatingAfter();

    await chooseTranslatingAfter();

    expect(warning()).toEqual([null, "開始轉錄"]);
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

    expect(openButton().disabled).toBe(true);
  });

  // @behavior TX-022
  it("warns before overwriting a subtitle and asks to overwrite it", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: true })],
      }),
    );
    await openDialog();
    const warned = warning()[0];

    await startFromDialog();

    expect([warned, transcribeArgs]).toEqual([
      "字幕已存在，開始後會覆蓋",
      { overwrite: true, scope: { kind: "whole" } },
    ]);
  });

  // @behavior TX-062
  it("starts no transcription while another task runs", async () => {
    await hold(media);
    run.begin("diarization");

    await start();

    expect(transcribeArgs).toBeUndefined();
  });
});

describe("TranscriptionDialog, transcribing again from the editor", () => {
  let project: ProjectView | null;
  let transcription: () => Promise<unknown>;
  let transcribeArgs: unknown;
  let retranslateArgs: unknown;
  let commandsSent: string[];

  const rows = () => [...rowList().children];

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

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

  async function openFromMenu(index: number): Promise<void> {
    rows()
      [index].querySelector<HTMLButtonElement>("button.retranscribe")!
      .click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    transcription = () => new Promise(() => {});
    transcribeArgs = undefined;
    retranslateArgs = undefined;
    commandsSent = [];
    document.body.innerHTML = `
      <section></section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        commandsSent.push(command);
        if (command === "current_project") return project;
        if (command === "model_settings")
          return { transcription: { path: "/models/breeze.bin" } };
        if (command === "transcribe") {
          transcribeArgs = args;
          return transcription();
        }
        if (command === "retranslate") {
          retranslateArgs = args;
          return new Promise(() => {});
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    const context = pageContext(assembly.feed, assembly.session);
    const transcriptionDialog = renderWithToolbar(
      TranscriptionDialog,
      "openTranscription",
      context,
    );
    drawSegmentList(
      document.querySelector("section")!,
      context,
      segmentDialogsOf({ transcription: transcriptionDialog }),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TX-048
  it("transcribes again from a Segment's menu", async () => {
    await hold(projectWithMedia());

    await openFromMenu(1);
    const shown = [
      screen.queryByText("從 00:00:05.000 以下") !== null,
      screen.queryByRole("alert", { hidden: true }) !== null,
    ];
    await startFromDialog();

    expect([shown, transcribeArgs]).toEqual([
      [true, true],
      { overwrite: true, scope: { kind: "rest", first: 1 } },
    ]);
  });

  // @behavior TX-049
  it("transcribes the Checked Segments again", async () => {
    await hold(projectWithMedia());
    checkRows(0, 2);
    await settle();

    checkedBarButton("重新轉錄")!.click();
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
    await openFromMenu(1);
    await chooseTranslatingAfter();

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
      rows()[0].querySelector("button.retranscribe"),
      checkedBarButton("重新轉錄"),
    ]).toEqual([null, null]);
  });

  // @behavior TX-052
  it("offers translating afterwards only into the translation shown", async () => {
    await hold(projectWithMedia());

    await openFromMenu(1);

    expect(choice("完成後翻譯")).toBeNull();
  });

  // @behavior DZ-020
  it("leaves a transcription within an Audio Window undiarized", async () => {
    await hold({
      ...projectWithMedia(),
      options: {
        ...projectWithMedia().options,
        is_diarized_after_transcription: true,
      },
    });
    transcription = async () => ({
      audio_seconds: 10,
      transcribe_seconds: 2,
      phases: [],
      written_span: { first: 1, last: 2 },
    });
    await openFromMenu(1);
    const offered = choice("完成後辨識說話者");

    await startFromDialog();
    await settle();

    expect([offered, commandsSent.includes("diarize")]).toEqual([null, false]);
  });
});
