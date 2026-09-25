// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import { NOTIFICATION_STACK } from "../ui/test_notification";
import ProgressController from "./progress_controller";
import RetranslationController from "./retranslation_controller";
import SegmentChangesController from "./segment_changes_controller";
import TranscriptController from "./transcript_controller";

describe("RetranslationController", () => {
  let application: Application;
  let project: ProjectView | null;
  let retranslated: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const rows = () => document.querySelectorAll<HTMLLIElement>("ol > li");
  const isProgressShown = () =>
    !document.querySelector<HTMLElement>("#progress")!.hidden;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  const projectTranslatedIntoEnglish = projectOf({
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
    retranslated = undefined;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript segment-changes retranslation"
        data-retranslation-progress-outlet="#progress"
        data-action="transcript:shown->retranslation#follow segment-changes:retranslate->retranslation#translateSelection">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="empty"></p>
        <div data-segment-changes-target="selection" hidden>
          <span data-segment-changes-target="selectionCount"></span>
          <button data-segment-changes-target="merge"></button>
          <button id="retranslate-selection" data-retranslation-target="selection"
            data-action="segment-changes#retranslate">重新翻譯</button>
        </div>
        <ol data-transcript-target="list"></ol>
      </section>
      <div id="progress" data-controller="progress" hidden>
        <span data-progress-target="summary"></span>
        <ul data-progress-target="steps"></ul>
        <p data-progress-target="status"></p>
        <progress max="100" data-progress-target="bar" hidden></progress>
      </div>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "retranslate") {
          retranslated = args;
          return new Promise(() => {});
        }
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("progress", ProgressController);
    application.register("transcript", TranscriptController);
    application.register("segment-changes", SegmentChangesController);
    application.register("retranslation", RetranslationController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior ED-039
  it("translates a Segment again from its menu", async () => {
    await hold(projectTranslatedIntoEnglish);

    rows()[1].querySelector<HTMLButtonElement>("button.retranslate")!.click();
    await settle();

    expect([retranslated, isProgressShown()]).toEqual([{ indexes: [1] }, true]);
  });

  // @behavior ED-040
  it("translates the selected Segments again", async () => {
    await hold(projectTranslatedIntoEnglish);
    for (const index of [0, 2]) {
      const checkbox =
        rows()[index].querySelector<HTMLInputElement>("input.selection")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    document
      .querySelector<HTMLButtonElement>("#retranslate-selection")!
      .click();
    await settle();

    expect(retranslated).toEqual({ indexes: [0, 2] });
  });
});
