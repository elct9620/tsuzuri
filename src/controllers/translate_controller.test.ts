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
  notificationItems,
  notifications,
} from "../ui/test_notification";
import TranslateController from "./translate_controller";
import TranslationOptionsController from "./translation_options_controller";

describe("TranslateController", () => {
  let application: Application;
  let translateArgs: unknown;
  let translation: () => Promise<unknown>;
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-translate-target="${name}"]`)!;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  async function openDialog(): Promise<void> {
    target("open").click();
    await settle();
  }

  async function start(): Promise<void> {
    await openDialog();
    document.querySelector<HTMLButtonElement>("#start")!.click();
    await settle();
  }

  const option = <T extends HTMLElement>(name: string) =>
    translationOption<T>("#translate-options", name);

  function check(name: string): void {
    option<HTMLInputElement>(name).checked = true;
  }

  beforeEach(async () => {
    project = null;
    translateArgs = undefined;
    translation = async () => ({
      phases: [
        { phase: "prepare", seconds: 0.01 },
        { phase: "load", seconds: 2.17 },
        { phase: "translate", seconds: 0.61 },
      ],
    });
    document.body.innerHTML = `
      ${translationOptionsTemplate}
      <div data-controller="translate" data-translate-progress-outlet="#progress"
        data-action="translation-options:overwrite->translate#showOverwrite"
        data-translate-translation-options-outlet="#translate-options">
        <button data-translate-target="open" data-action="translate#open" disabled>翻譯</button>
        <dialog data-translate-target="dialog">
          <span data-translate-target="source"></span>
          <div id="translate-options" data-controller="translation-options"></div>
          <div data-translate-target="overwrite" hidden></div>
          <button id="start" data-translate-target="start" data-action="translate#start">開始翻譯</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" hidden>
        <span data-progress-target="summary"></span>
        <ul data-progress-target="steps"></ul>
        <p data-progress-target="status"></p>
        <progress max="100" data-progress-target="bar" hidden></progress>
      </div>
      ${NOTIFICATION_STACK}
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
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
      translate: TranslateController,
      "translation-options": TranslationOptionsController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TL-065
  it("shows how many Segments are translated beside the percentage", async () => {
    await hold(projectOf());
    translation = () => new Promise(() => {});
    await start();

    await emit("pipeline-progress", {
      phase: "translate",
      percent: 63,
      count: { done: 132, total: 210 },
    });
    await settle();

    expect(
      document.querySelector('[data-progress-target="status"]')!.textContent,
    ).toBe("翻譯 63%，132 / 210");
  });

  // @behavior TL-005
  it("translates the Current Resource into the selected language", async () => {
    await hold(projectOf());

    await start();

    expect(translateArgs).toMatchObject({ target: "ja" });
  });

  const projectTranslatedIntoEnglish = projectOf({
    resources: [resourceOf({ translation_languages: ["en"] })],
    translation_language: "en",
  });
  const isOverwriteWarned = () => !target("overwrite").hidden;

  // @behavior TL-079
  it("asks before overwriting a translation", async () => {
    await hold(projectTranslatedIntoEnglish);

    await openDialog();

    expect([isOverwriteWarned(), target("start").textContent]).toEqual([
      true,
      "覆蓋並開始",
    ]);
  });

  // @behavior TL-080
  it("warns only of a Language already translated", async () => {
    await hold(projectTranslatedIntoEnglish);
    await openDialog();
    const language = option<HTMLSelectElement>("language");

    language.value = "ja";
    language.dispatchEvent(new Event("change"));

    expect([isOverwriteWarned(), target("start").textContent]).toEqual([
      false,
      "開始翻譯",
    ]);
  });

  // @behavior TL-015
  it("names the Primary Language it translates from", async () => {
    await hold(projectOf({ language: "ja" }));

    await openDialog();

    expect(target("source").textContent).toBe("日本語");
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

  // @behavior TL-011
  it("cannot start translating a Resource without an original subtitle", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: false })],
      }),
    );

    expect(target<HTMLButtonElement>("open").disabled).toBe(true);
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

    expect(option("glossary").textContent).toBe("glossary.csv（12 筆）");
  });

  // @behavior TL-056
  it("translates with the options the dialog offers", async () => {
    await hold(projectOf());
    check("speakerLabels");
    check("selfReview");
    check("summary");
    option<HTMLInputElement>("summaryWords").value = "80";

    await start();

    expect(translateArgs).toMatchObject({
      options: {
        has_speaker_labels: true,
        has_self_review: true,
        summary_word_limit: 80,
      },
    });
  });
});
