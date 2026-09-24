// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../project";
import { projectOf, resourceOf } from "../test_project";
import ProgressController from "./progress_controller";
import TranslateController from "./translate_controller";

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

  function check(name: string): void {
    target<HTMLInputElement>(name).checked = true;
  }

  beforeEach(async () => {
    project = null;
    translateArgs = undefined;
    document.body.innerHTML = `
      <div data-controller="translate" data-translate-progress-outlet="#progress">
        <button data-translate-target="open" data-action="translate#open" disabled>翻譯</button>
        <dialog data-translate-target="dialog">
          <span data-translate-target="source"></span>
          <select data-translate-target="language">
            <option value="en">English</option>
            <option value="ja" selected>日本語</option>
          </select>
          <span data-translate-target="glossary"></span>
          <input type="checkbox" data-translate-target="speakerLabels">
          <input type="checkbox" data-translate-target="selfReview">
          <input type="checkbox" data-translate-target="summary">
          <input type="number" value="100" data-translate-target="summaryWords">
          <button id="start" data-action="translate#start">開始翻譯</button>
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

    expect(
      document.querySelector('[data-progress-target="status"]')!.textContent,
    ).toBe("完成\n準備元件 0.0 秒 · 載入模型 2.2 秒 · 翻譯 0.6 秒");
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
        translation_glossary: { file: "/talks/glossary.csv", term_count: 12 },
      }),
    );

    await openDialog();

    expect(target("glossary").textContent).toBe("glossary.csv（12 筆）");
  });

  // @behavior TL-056
  it("translates with the options the dialog offers", async () => {
    await hold(projectOf());
    check("speakerLabels");
    check("selfReview");
    check("summary");
    target<HTMLInputElement>("summaryWords").value = "80";

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
