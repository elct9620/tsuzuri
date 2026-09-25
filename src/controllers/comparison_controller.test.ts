// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ComparedRow,
  ProjectView,
  SubtitleVersions,
} from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import ComparisonController from "./comparison_controller";
import TranscriptController from "./transcript_controller";

describe("ComparisonController", () => {
  let application: Application;
  let project: ProjectView;
  let versions: SubtitleVersions[];
  let rows: ComparedRow[];
  let calls: { command: string; args: unknown }[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);
  const cue = (start_ms: number, end_ms: number, text: string) => ({
    start_ms,
    end_ms,
    text,
  });
  const pair = (
    left: ReturnType<typeof cue>,
    right: ReturnType<typeof cue>,
  ): ComparedRow => ({
    kind: "pair",
    left: [left],
    right: [right],
    is_text_changed: left.text !== right.text,
    is_time_changed:
      left.start_ms !== right.start_ms || left.end_ms !== right.end_ms,
    text_spans: [],
  });
  const marks = () =>
    [...document.querySelectorAll("ol > li:not([data-ghost])")].map((item) =>
      [...item.querySelectorAll("[data-mark]")].map((mark) => mark.textContent),
    );

  async function show(): Promise<void> {
    await emit("project-changed");
    await settle();
    await settle();
  }

  beforeEach(async () => {
    calls = [];
    project = projectOf({
      segments: [
        { start_ms: 0, end_ms: 1000, text: "您好" },
        { start_ms: 2000, end_ms: 3000, text: "再見" },
      ],
    });
    versions = [
      {
        language: null,
        backups: [
          {
            file: "ep01.20260925T030000Z.srt",
            taken_at: "20260925T030000Z",
            kind: "overwrite",
          },
          {
            file: "ep01.20260925T023000Z.output.srt",
            taken_at: "20260925T023000Z",
            kind: "output",
          },
        ],
      },
    ];
    rows = [
      pair(cue(0, 1000, "你好"), cue(0, 1000, "您好")),
      {
        kind: "removal",
        left: [cue(1000, 2000, "世界")],
        right: [],
        is_text_changed: false,
        is_time_changed: false,
        text_spans: [],
      },
      {
        kind: "addition",
        left: [],
        right: [cue(2000, 3000, "再見")],
        is_text_changed: false,
        is_time_changed: false,
        text_spans: [],
      },
    ];
    document.body.innerHTML = `
      <main data-controller="transcript comparison"
        data-action="transcript:shown->comparison#mark">
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage"></select>
        <select data-comparison-target="choice" data-action="change->comparison#choose"></select>
        <p data-transcript-target="empty"></p>
        <ol data-transcript-target="list" data-comparison-target="list"></ol>
        <datalist data-transcript-target="speakers"></datalist>
      </main>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "subtitle_versions") return versions;
        if (command === "compare_versions") return rows;
        if (command === "translation_cues") return [cue(0, 1000, "こんにちは")];
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("transcript", TranscriptController);
    application.register("comparison", ComparisonController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior VR-023
  it("compares the editor with the newest Output", async () => {
    await show();

    expect(sent("compare_versions").pop()).toEqual({
      language: null,
      left: "ep01.20260925T023000Z.output.srt",
      right: null,
    });
  });

  // @behavior VR-024
  it("marks what changed on each row", async () => {
    rows = [
      pair(cue(0, 1000, "你好"), cue(0, 1000, "您好")),
      pair(cue(2000, 2500, "再見"), cue(2000, 3000, "再見")),
    ];
    await show();
    rows = [
      pair(cue(0, 1000, "您好"), cue(0, 1000, "您好")),
      {
        kind: "addition",
        left: [],
        right: [cue(2000, 3000, "再見")],
        is_text_changed: false,
        is_time_changed: false,
        text_spans: [],
      },
    ];
    const timesChanged = marks();
    await show();

    expect([timesChanged, marks()]).toEqual([
      [["文"], ["時"]],
      [[], ["新"]],
    ]);
  });

  // @behavior VR-025
  it("shows what a changed text read before", async () => {
    await show();

    expect(document.querySelector("li [data-was]")?.textContent).toBe(
      "原：你好",
    );
  });

  // @behavior VR-026
  it("shows a removed cue in its place", async () => {
    await show();

    const items = [...document.querySelectorAll("ol > li")];
    expect([
      items.length,
      items[1].hasAttribute("data-ghost"),
      items[1].textContent,
    ]).toEqual([3, true, expect.stringContaining("已刪除：世界")]);
  });

  // @behavior VR-027
  it("takes back a row from the editor", async () => {
    await show();

    document.querySelector<HTMLButtonElement>("li .revert-text")!.click();
    await settle();

    expect(sent("revert_row")).toEqual([
      {
        language: null,
        backup: "ep01.20260925T023000Z.output.srt",
        row: 0,
        part: "text",
      },
    ]);
  });

  // @behavior VR-028
  it("compares with nothing", async () => {
    await show();
    const choice = document.querySelector<HTMLSelectElement>(
      "[data-comparison-target=choice]",
    )!;

    choice.value = "";
    choice.dispatchEvent(new Event("change"));
    await settle();

    expect([marks(), document.querySelectorAll("[data-ghost]").length]).toEqual(
      [[[], []], 0],
    );
  });
  // @behavior VR-029
  it("moves the comparison to a newer Output", async () => {
    await show();
    versions[0].backups.unshift({
      file: "ep01.20260925T040000Z.output.srt",
      taken_at: "20260925T040000Z",
      kind: "output",
    });

    await show();

    expect(sent("compare_versions").pop()).toEqual({
      language: null,
      left: "ep01.20260925T040000Z.output.srt",
      right: null,
    });
  });

  // @behavior VR-030
  it("offers the Backups of the translation shown", async () => {
    versions.push({
      language: "en",
      backups: [
        {
          file: "ep01.en.20260925T023100Z.output.srt",
          taken_at: "20260925T023100Z",
          kind: "output",
        },
      ],
    });
    await show();
    const offered = () =>
      [
        ...document.querySelectorAll<HTMLOptionElement>(
          "[data-comparison-target=choice] option",
        ),
      ].some((choice) => choice.value.includes("ep01.en."));
    const beforeShown = offered();
    project = { ...project, shown_translation: "en" };

    await show();

    expect([beforeShown, offered()]).toEqual([false, true]);
  });
  const choiceTarget = () =>
    document.querySelector<HTMLSelectElement>(
      "[data-comparison-target=choice]",
    )!;

  // @behavior VR-038
  it("offers the other translations to read beside the cues", async () => {
    project = {
      ...project,
      resources: [resourceOf({ translation_languages: ["en", "ja"] })],
      shown_translation: "en",
    };

    await show();

    const references = [...choiceTarget().options]
      .map((choice) => choice.value)
      .filter((value) => value.includes("reference"));
    expect(references).toEqual([JSON.stringify({ reference: "ja" })]);
  });

  // @behavior VR-039
  it("shows a translation beside each cue", async () => {
    project = {
      ...project,
      resources: [resourceOf({ translation_languages: ["ja"] })],
    };
    await show();

    choiceTarget().value = JSON.stringify({ reference: "ja" });
    choiceTarget().dispatchEvent(new Event("change"));
    await settle();

    const first = document.querySelector("ol > li")!;
    expect([
      first.querySelector("[data-reference]")?.textContent,
      document.querySelectorAll("[data-mark]").length,
    ]).toEqual(["こんにちは", 0]);
  });
});
