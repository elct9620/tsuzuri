// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    document.body.innerHTML = `
      ${translationOptionsTemplate}
      <div data-controller="translate" data-translate-progress-outlet="#progress"
        data-translate-translation-options-outlet="#translate-options">
        <button data-translate-target="open" data-action="translate#open" disabled>翻譯</button>
        <dialog data-translate-target="dialog">
          <span data-translate-target="source"></span>
          <div id="translate-options" data-controller="translation-options"></div>
          <button id="start" data-action="translate#start">開始翻譯</button>
        </dialog>
      </div>
      <div id="progress" data-controller="progress" hidden>
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
          return {
            phases: [
              { phase: "prepare", seconds: 0.01 },
              { phase: "load", seconds: 2.17 },
              { phase: "translate", seconds: 0.61 },
            ],
          };
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("progress", ProgressController);
    application.register("translate", TranslateController);
    application.register("translation-options", TranslationOptionsController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TL-005
  it("translates the Current Resource into the selected language", async () => {
    await hold(projectOf());

    await start();

    expect(translateArgs).toMatchObject({ target: "ja" });
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
