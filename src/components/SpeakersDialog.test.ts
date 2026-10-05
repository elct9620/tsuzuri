// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { ProjectView } from "../backend/project";
import SegmentChangesController from "../controllers/segment-changes-controller";
import TranscriptController from "../controllers/transcript-controller";
import { setInterfaceLanguage } from "../i18n";
import { projectOf } from "../test-project";
import { pageContext } from "./context";
import SpeakersDialog from "./SpeakersDialog.svelte";
import { showNotifications } from "./test-notifications";

describe("SpeakersDialog", () => {
  let speakersDialog: SpeakersDialog;
  let application: Application;
  let project: ProjectView | null;
  let setSpeakersArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  async function check(...indexes: number[]): Promise<void> {
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
    scope: string | RegExp,
    name: string,
    from?: string,
  ): Promise<void> {
    screen.getByRole("radio", { hidden: true, name: scope }).click();
    if (from !== undefined) {
      const renamedChoice = screen.getByRole<HTMLSelectElement>("combobox", {
        hidden: true,
        name: "要改名的說話者",
      });
      renamedChoice.value = from;
      renamedChoice.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const speakerField = screen.getByRole<HTMLInputElement>("textbox", {
      hidden: true,
      name: "設為",
    });
    speakerField.value = name;
    speakerField.dispatchEvent(new Event("input", { bubbles: true }));
    screen.getByRole("button", { hidden: true, name: "套用" }).click();
    await settle();
  }

  async function openDialog(): Promise<void> {
    speakersDialog.open();
    await settle();
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
    setSpeakersArgs = undefined;
    document.body.innerHTML = `
      <section data-controller="transcript segment-changes"
        data-action="selectionchange@document->transcript#followSelection editor:checks@window->transcript#showChecked editor:checks@window->segment-changes#showChecked">
        <p data-transcript-target="emptyHint"></p>
        <div data-segment-changes-target="checkedBar" hidden>
          <span data-segment-changes-target="checkedCount"></span>
          <button data-segment-changes-target="mergeButton"></button>
          <button id="speakers-of-checked" data-action="segment-changes#openSpeakers">說話者</button>
        </div>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    showNotifications();
    mockIPC(
      (command, args) => {
        if (command === "current_project") return project;
        if (command === "set_speakers") setSpeakersArgs = args;
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    const assembly = assemble(application, {
      transcript: TranscriptController,
      "segment-changes": SegmentChangesController,
    });
    speakersDialog = render(SpeakersDialog, {
      context: pageContext(assembly.feed, assembly.session),
    }).component;
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior ED-034
  it("sets the Speaker of the Checked Segments", async () => {
    await hold(saidBy("", "", ""));
    await check(0, 2);
    document.querySelector<HTMLButtonElement>("#speakers-of-checked")!.click();
    await settle();

    await apply("已勾選 2 段", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-035
  it("sets the Speaker of every Segment", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("全部段落", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 1, 2], speaker: "co" });
  });

  // @behavior ED-036
  it("names only the Segments without a Speaker", async () => {
    await hold(saidBy("", "cl", ""));
    await openDialog();

    await apply("沒有說話者的段落", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "co" });
  });

  // @behavior ED-037
  it("renames a Speaker", async () => {
    await hold(saidBy("co", "cl", "co"));
    await openDialog();

    await apply(/^說話者是/, "小明", "co");

    expect(setSpeakersArgs).toEqual({ indexes: [0, 2], speaker: "小明" });
  });
});
