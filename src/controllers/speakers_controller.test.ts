// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import { projectOf } from "../test_project";
import { NOTIFICATION_STACK } from "../ui/test_notification";
import SegmentChangesController from "./segment_changes_controller";
import SpeakersController from "./speakers_controller";
import TranscriptController from "./transcript_controller";

describe("SpeakersController", () => {
  let application: Application;
  let project: ProjectView | null;
  let named: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-speakers-target="${name}"]`)!;

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  /** A Project of three Segments, said by `speakers` in turn, `""` naming none. */
  const saidBy = (...speakers: string[]) =>
    projectOf({
      segments: speakers.map((speaker, at) => ({
        start_ms: at * 1000,
        end_ms: (at + 1) * 1000,
        ...(speaker ? { speaker } : {}),
        text: "你好",
      })),
    });

  async function select(...indexes: number[]): Promise<void> {
    const rows = document.querySelectorAll<HTMLLIElement>("ol > li");
    for (const index of indexes) {
      const checkbox =
        rows[index].querySelector<HTMLInputElement>("input.check")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await settle();
  }

  /** Chooses `scope` in the open Speaker dialog, sets the Speaker to `name` and applies it. */
  async function apply(
    scope: string,
    name: string,
    from?: string,
  ): Promise<void> {
    document
      .querySelector<HTMLInputElement>(`input[value="${scope}"]`)!
      .click();
    if (from !== undefined)
      target<HTMLSelectElement>("renamedSpeaker").value = from;
    target<HTMLInputElement>("newSpeaker").value = name;
    document.querySelector<HTMLButtonElement>("#apply")!.click();
    await settle();
  }

  async function openDialog(): Promise<void> {
    document.querySelector<HTMLButtonElement>("#open-speakers")!.click();
    await settle();
  }

  beforeEach(async () => {
    project = null;
    named = undefined;
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript segment-changes speakers"
        data-action="transcript:shown->speakers#follow editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked segment-changes:speakers->speakers#openForChecked">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <p data-transcript-target="emptyHint"></p>
        <button id="open-speakers" data-action="speakers#open">說話者</button>
        <dialog data-speakers-target="dialog">
          <label data-speakers-target="checkedChoice">
            <input type="radio" name="speaker-scope" value="checked-segments" data-speakers-target="scope">
            <span data-speakers-target="checkedCount"></span>
          </label>
          <input type="radio" name="speaker-scope" value="all-segments" data-speakers-target="scope">
          <input type="radio" name="speaker-scope" value="unnamed-segments" data-speakers-target="scope">
          <input type="radio" name="speaker-scope" value="named-segments" data-speakers-target="scope">
          <select data-speakers-target="renamedSpeaker"></select>
          <input data-speakers-target="newSpeaker">
          <div data-speakers-target="names"></div>
          <button id="apply" data-action="speakers#apply">套用</button>
        </dialog>
        <div data-segment-changes-target="checkedBar" hidden>
          <span data-segment-changes-target="checkedCount"></span>
          <button data-segment-changes-target="mergeButton"></button>
          <button id="speakers-of-selection" data-action="segment-changes#openSpeakers">說話者</button>
        </div>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "set_speakers") named = args;
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    await assemble(application, {
      transcript: TranscriptController,
      "segment-changes": SegmentChangesController,
      speakers: SpeakersController,
    }).start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior ED-034
  it("sets the Speaker of the selected Segments", async () => {
    await hold(saidBy("", "", ""));
    await select(0, 2);
    document
      .querySelector<HTMLButtonElement>("#speakers-of-selection")!
      .click();
    await settle();

    await apply("checked-segments", "co");

    expect(named).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-035
  it("sets the Speaker of every Segment", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("all-segments", "co");

    expect(named).toEqual({ indexes: [0, 1, 2], speaker: "co" });
  });

  // @behavior ED-036
  it("names only the Segments without a Speaker", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("unnamed-segments", "co");

    expect(named).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-037
  it("renames a Speaker", async () => {
    await hold(saidBy("co", "cl", "co"));
    await openDialog();

    await apply("named-segments", "小明", "co");

    expect(named).toEqual({ indexes: [0, 2], speaker: "小明" });
  });
});
