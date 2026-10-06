// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assemble } from "#/assembly.ts";
import { editingPort } from "#/backend/editing.ts";
import { ProjectFeed, type ProjectView } from "#/backend/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { projectOf, resourceOf } from "#/test-project.ts";
import {
  showNotifications,
  notificationItems,
  notifications,
} from "#/components/test-notifications.ts";
import { pageContext } from "#/components/context.ts";
import { TaskRun } from "#/components/task-run.svelte.ts";
import TaskProgress from "#/components/TaskProgress.svelte";
import { progressSteps } from "#/components/test-task-progress.ts";
import {
  chooseLanguage,
  languageSelect,
  optionCheckbox,
  setSummaryWords,
} from "#/components/test-translation-options.ts";
import TranslationDialog from "#/components/TranslationDialog.svelte";
import { renderWithToolbar } from "#/components/test-toolbar.ts";
import {
  checkedBarButton,
  drawSegmentList,
  rowList,
  segmentDialogsOf,
} from "#/components/test-segment-rows.ts";

describe("TranslationDialog", () => {
  let feed: ProjectFeed;
  let translateArgs: unknown;
  let translation: () => Promise<unknown>;
  let project: ProjectView | null;
  let isCleanupSaved: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const openButton = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "翻譯" });
  const startButton = () =>
    screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: /開始/,
    });
  const overwriteWarning = () =>
    screen.queryByText("這個語言的譯文已存在，開始後會覆蓋");

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await feed.refresh();
    await settle();
  }

  async function openDialog(): Promise<void> {
    openButton().click();
    await settle();
  }

  async function startFromDialog(): Promise<void> {
    startButton().click();
    await settle();
  }

  async function start(): Promise<void> {
    await openDialog();
    await startFromDialog();
  }

  beforeEach(() => {
    project = null;
    translateArgs = undefined;
    isCleanupSaved = true;
    translation = async () => ({
      phases: [
        { phase: "prepare", seconds: 0.01 },
        { phase: "load", seconds: 2.17 },
        { phase: "translate", seconds: 0.61 },
      ],
      unmatched_count: 0,
    });
    showNotifications();
    mockIPC((command, args) => {
      if (command === "current_project") return project;
      if (command === "translation_settings")
        return { is_simplified_cleaned: isCleanupSaved };
      if (command === "translate") {
        translateArgs = args;
        return translation();
      }
    });
    feed = new ProjectFeed();
    renderWithToolbar(
      TranslationDialog,
      "openTranslation",
      pageContext(feed, new EditingSession(editingPort)),
    );
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TL-005
  it("translates the Current Resource into the selected language", async () => {
    await hold(projectOf());
    await openDialog();

    chooseLanguage("ja");
    await startFromDialog();

    expect(translateArgs).toMatchObject({ target: "ja" });
  });

  const projectTranslatedIntoEnglish = projectOf({
    resources: [resourceOf({ translation_languages: ["en"] })],
    translation_language: "en",
  });

  // @behavior TL-079
  it("asks before overwriting a translation", async () => {
    await hold(projectTranslatedIntoEnglish);

    await openDialog();

    expect([overwriteWarning() !== null, startButton().textContent]).toEqual([
      true,
      "覆蓋並開始",
    ]);
  });

  // @behavior TL-080
  it("warns only of a Language already translated", async () => {
    await hold(projectTranslatedIntoEnglish);
    await openDialog();

    chooseLanguage("ja");
    await settle();

    expect([overwriteWarning(), startButton().textContent]).toEqual([
      null,
      "開始翻譯",
    ]);
  });

  // @behavior TL-015
  it("names the Primary Language it translates from", async () => {
    await hold(projectOf({ language: "ja" }));

    await openDialog();

    expect(screen.getByText("日本語", { selector: "span" })).not.toBeNull();
  });

  // @behavior TL-008
  it("lists how long each Phase took once translated", async () => {
    await hold(projectOf());

    await start();

    expect([notifications(), notificationItems(0)]).toEqual([
      ["翻譯完成"],
      [
        ["準備元件", "0.0 秒"],
        ["載入模型", "2.2 秒"],
        ["翻譯", "0.6 秒"],
      ],
    ]);
  });

  // @behavior TL-086
  it("warns of the Segments a translation left unmatched", async () => {
    translation = async () => ({ phases: [], unmatched_count: 2 });
    await hold(projectOf());

    await start();

    expect(notifications()).toEqual(["翻譯完成", "2 段對不上譯文"]);
  });

  // @behavior TL-011
  it("cannot start translating a Resource without an original subtitle", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: false })],
      }),
    );

    expect(openButton().disabled).toBe(true);
  });

  // @behavior TL-042
  it("names the Project's glossary.csv and its terms", async () => {
    await hold(
      projectOf({
        translation_glossary: {
          file: "/talks/glossary.csv",
          term_count: 12,
          speakers: [],
        },
      }),
    );

    await openDialog();

    expect(screen.getByText("glossary.csv（12 筆）")).not.toBeNull();
  });

  // @behavior TL-056
  it("translates with the options the dialog offers", async () => {
    await hold(projectOf());
    await openDialog();
    optionCheckbox("自我檢查")!.click();
    optionCheckbox(/滾動摘要/)!.click();
    setSummaryWords("80");

    await startFromDialog();

    expect(translateArgs).toMatchObject({
      options: { has_self_review: true, summary_word_limit: 80 },
    });
  });

  // @behavior TL-102
  it("offers no Speaker Labels and translates without them", async () => {
    await hold(projectOf());
    await openDialog();
    const speakerLabelsChoice = optionCheckbox(/說話者/);

    await startFromDialog();

    expect([
      speakerLabelsChoice,
      "has_speaker_labels" in (translateArgs as { options: object }).options,
    ]).toEqual([null, false]);
  });

  // @behavior TL-100
  it("offers the cleanup as saved only while translating into zh-TW", async () => {
    isCleanupSaved = false;
    await hold(projectOf({ translation_language: "zh-TW" }));
    await openDialog();
    const cleanup = optionCheckbox("清理簡體");
    const intoTraditionalChinese = [cleanup !== null, cleanup?.checked];

    chooseLanguage("ja");
    await settle();

    expect([intoTraditionalChinese, optionCheckbox("清理簡體")]).toEqual([
      [true, false],
      null,
    ]);
  });

  // @behavior TL-100
  it("translates into zh-TW with the cleanup the settings start checked", async () => {
    await hold(projectOf({ translation_language: "zh-TW" }));

    await start();

    expect(translateArgs).toMatchObject({
      options: { is_simplified_cleaned: true },
    });
  });

  // @behavior TL-101
  it("translates without the cleanup the dialog unchecked", async () => {
    await hold(projectOf({ translation_language: "zh-TW" }));
    await openDialog();
    optionCheckbox("清理簡體")!.click();

    await startFromDialog();

    expect(translateArgs).toMatchObject({
      options: { is_simplified_cleaned: false },
    });
  });

  // @behavior TL-097
  it("starts no translation while the summary has no word limit", async () => {
    await hold(projectOf());
    await openDialog();
    optionCheckbox(/滾動摘要/)!.click();
    setSummaryWords("");

    await startFromDialog();

    expect(translateArgs).toBeUndefined();
  });

  // @behavior TL-103
  it("starts no translation while another task runs", async () => {
    const run = new TaskRun();
    cleanup();
    showNotifications();
    renderWithToolbar(
      TranslationDialog,
      "openTranslation",
      pageContext(feed, new EditingSession(editingPort), run),
    );
    await hold(projectOf());
    run.begin("transcription");

    await start();

    expect(translateArgs).toBeUndefined();
  });
});

describe("TranslationDialog, translating chosen Segments again", () => {
  let project: ProjectView | null;
  let retranslateArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const rows = () => [...rowList().children];
  const isProgressShown = () => progressSteps().length > 0;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function startFromDialog(): Promise<void> {
    screen.getByRole("button", { hidden: true, name: /開始/ }).click();
    await settle();
  }

  const projectShowingEnglish = projectOf({
    resources: [resourceOf({ translation_languages: ["en"] })],
    shown_translation: "en",
    segments: ["大家好", "資料不上傳", "謝謝"].map((text, at) => ({
      start_ms: at * 1000,
      end_ms: (at + 1) * 1000,
      text,
      translation: text,
    })),
  });

  beforeEach(async () => {
    project = null;
    retranslateArgs = undefined;
    document.body.innerHTML = `
      <section></section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "retranslate") {
          retranslateArgs = args;
          return new Promise(() => {});
        }
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    const context = pageContext(assembly.feed, assembly.session, new TaskRun());
    const translation = render(TranslationDialog, { context }).component;
    drawSegmentList(
      document.querySelector("section")!,
      context,
      segmentDialogsOf({ translation }),
    );
    render(TaskProgress, { context });
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior ED-039
  it("translates a Segment again from its menu", async () => {
    await hold(projectShowingEnglish);

    rows()[1].querySelector<HTMLButtonElement>("button.retranslate")!.click();
    await settle();
    await startFromDialog();

    expect([retranslateArgs, isProgressShown()]).toEqual([
      {
        indexes: [1],
        options: {
          is_simplified_cleaned: false,
          has_self_review: false,
          summary_word_limit: null,
        },
      },
      true,
    ]);
  });

  // @behavior ED-040
  it("translates the Checked Segments again", async () => {
    await hold(projectShowingEnglish);
    for (const index of [0, 2]) {
      const checkbox =
        rows()[index].querySelector<HTMLInputElement>("input.check")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await settle();

    checkedBarButton("重新翻譯")!.click();
    await settle();
    await startFromDialog();

    expect(retranslateArgs).toMatchObject({ indexes: [0, 2] });
  });

  // @behavior ED-090
  it("offers no translating again without a translation shown", async () => {
    await hold({
      ...projectShowingEnglish,
      shown_translation: null,
      segments: projectShowingEnglish.segments.map(
        ({ translation: _, ...segment }) => segment,
      ),
    });
    const checkbox = rows()[0].querySelector<HTMLInputElement>("input.check")!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect([
      rows()[0].querySelector("button.retranslate"),
      checkedBarButton("重新翻譯"),
    ]).toEqual([null, null]);
  });

  // @behavior TL-093
  it("warns that a line translated again may read as going on from the one before", async () => {
    await hold(projectShowingEnglish);

    rows()[1].querySelector<HTMLButtonElement>("button.retranslate")!.click();
    await settle();

    expect([
      languageSelect().value,
      languageSelect().disabled,
      optionCheckbox(/滾動摘要/),
      screen.queryByText(/重翻的句子可能像在接話/) !== null,
      screen.queryByText("這個語言的譯文已存在，開始後會覆蓋"),
    ]).toEqual(["en", true, null, true, null]);
  });
});
