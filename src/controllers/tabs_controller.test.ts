// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ProjectController from "./project_controller";
import TabsController from "./tabs_controller";
import TranscribeController from "./transcribe_controller";
import TranslateController from "./translate_controller";

describe("TabsController", () => {
  let application: Application;

  beforeEach(async () => {
    document.body.innerHTML = `
      <section data-controller="tabs">
        <button data-tab="transcribe" aria-selected="true" data-tabs-target="tab" data-action="tabs#select">轉錄</button>
        <button data-tab="translate" aria-selected="false" data-tabs-target="tab" data-action="tabs#select">翻譯</button>
        <div data-tab="transcribe" data-tabs-target="panel">A</div>
        <div data-tab="translate" data-tabs-target="panel" hidden>B</div>
      </section>
    `;
    application = Application.start();
    application.register("tabs", TabsController);
    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
  });

  it("shows only the panel of the selected tab", () => {
    document
      .querySelector<HTMLElement>(
        '[data-tabs-target="tab"][data-tab="translate"]',
      )!
      .click();

    const visible = [
      ...document.querySelectorAll<HTMLElement>('[data-tabs-target="panel"]'),
    ]
      .filter((panel) => !panel.hidden)
      .map((panel) => panel.dataset.tab);
    expect(visible).toEqual(["translate"]);
  });

  it("marks only the clicked tab as selected", () => {
    document
      .querySelector<HTMLElement>(
        '[data-tabs-target="tab"][data-tab="translate"]',
      )!
      .click();

    const selected = [
      ...document.querySelectorAll<HTMLElement>('[data-tabs-target="tab"]'),
    ]
      .filter((tab) => tab.getAttribute("aria-selected") === "true")
      .map((tab) => tab.dataset.tab);
    expect(selected).toEqual(["translate"]);
  });

  describe("when work ends", () => {
    let transcribe: () => unknown;

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const shown = () =>
      [...document.querySelectorAll<HTMLElement>('[data-tabs-target="panel"]')]
        .filter((panel) => !panel.hidden)
        .map((panel) => panel.dataset.tab);

    beforeEach(async () => {
      application.stop();
      transcribe = () => ({
        audio_seconds: 1,
        transcribe_seconds: 1,
        phases: [],
      });
      document.body.innerHTML = `
        <main data-controller="tabs project" data-action="transcribe:finished->tabs#showEdit translate:finished->tabs#showEdit project:opened->tabs#showTranslate">
          <button id="open" data-action="project#openSrt">從 SRT 建立</button>
          <section data-tab="transcribe" data-tabs-target="panel" data-controller="transcribe">
            <p data-transcribe-target="status"></p>
          </section>
          <section data-tab="translate" data-tabs-target="panel" data-controller="translate" hidden>
            <select data-translate-target="language"><option value="English">English</option></select>
            <button id="translate" data-translate-target="start" data-action="translate#translate">開始翻譯</button>
            <p data-translate-target="status"></p>
          </section>
          <section data-tab="edit" data-tabs-target="panel" hidden></section>
        </main>
      `;
      mockWindows("main");
      mockIPC(
        (command) => {
          if (command === "transcribe") return transcribe();
          if (command === "translate") return { phases: [] };
          if (command === "plugin:dialog|open") return "/subtitles/a.srt";
          if (command === "current_project") return null;
        },
        { shouldMockEvents: true },
      );
      application = Application.start();
      application.register("tabs", TabsController);
      application.register("project", ProjectController);
      application.register("transcribe", TranscribeController);
      application.register("translate", TranslateController);
      await settle();
    });

    afterEach(() => {
      clearMocks();
    });

    function controller<T>(identifier: string): T {
      return application.getControllerForElementAndIdentifier(
        document.querySelector(`[data-controller="${identifier}"]`)!,
        identifier,
      ) as T;
    }

    // @behavior TX-013
    it("shows the Edit tab once a transcription succeeds", async () => {
      await controller<TranscribeController>("transcribe").transcribe(
        "/media/lecture.mp4",
      );

      expect(shown()).toEqual(["edit"]);
    });

    // @behavior TX-014
    it("stays on the transcribe panel when a transcription fails", async () => {
      transcribe = () => {
        throw { code: "llama-exited" };
      };

      await controller<TranscribeController>("transcribe").transcribe(
        "/media/lecture.mp4",
      );

      expect(shown()).toEqual(["transcribe"]);
    });

    // @behavior TL-012
    it("shows the Edit tab once a translation succeeds", async () => {
      await controller<TranslateController>("translate").translate();

      expect(shown()).toEqual(["edit"]);
    });

    // @behavior PJ-009
    it("shows the Translate tab once an SRT file is opened", async () => {
      document.querySelector<HTMLButtonElement>("#open")!.click();
      await settle();

      expect(shown()).toEqual(["translate"]);
    });
  });
});
