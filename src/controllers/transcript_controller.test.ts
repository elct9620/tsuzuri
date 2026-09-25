// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GlossaryTable, ProjectView } from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import ProgressController from "./progress_controller";
import {
  NOTIFICATION_STACK,
  notificationAction,
  notificationDetail,
  notifications,
} from "../ui/test_notification";
import TranscriptController from "./transcript_controller";

describe("TranscriptController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let editFailure: unknown;
  let glossaryTable: GlossaryTable;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  function fields(): string[] {
    return [
      ...document.querySelectorAll<HTMLTextAreaElement>("li textarea"),
    ].map((field) => field.value);
  }

  function edit(selector: string, value: string): void {
    const field = document.querySelector<HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event("change"));
  }

  function progress(): ProgressController {
    return application.getControllerForElementAndIdentifier(
      document.querySelector("#progress")!,
      "progress",
    ) as ProgressController;
  }

  const placeholders = () =>
    document.querySelectorAll("[data-placeholder]").length;

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  const translated: ProjectView = projectOf({
    resources: [resourceOf({ translation_languages: ["en", "ja"] })],
    shown_translation: "en",
    segments: [
      {
        start_ms: 0,
        end_ms: 1000,
        text: "大家好",
        translation: "Hello everyone",
      },
    ],
  });

  beforeEach(async () => {
    project = null;
    calls = [];
    editFailure = undefined;
    glossaryTable = {
      languages: ["zh-TW", "en", "ja"],
      rows: [],
      has_source_target_header: false,
    };
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <section data-controller="transcript"
        data-action="progress:task->transcript#followTask project:select->transcript#showLoading">
        <div id="progress" data-controller="progress" hidden>
          <ul data-progress-target="steps"></ul>
          <p data-progress-target="status"></p>
          <progress data-progress-target="bar" hidden></progress>
        </div>
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage" data-action="change->transcript#showTranslation"></select>
        <p data-transcript-target="empty">尚無內容</p>
        <div class="dropdown">
          <div tabindex="0" role="button">匯出</div>
          <button id="save-original" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="original" disabled>原文</button>
          <button id="save-translation" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="translation" disabled>譯文</button>
          <button id="save-bilingual" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="bilingual" disabled>雙語</button>
        </div>
        <ol data-transcript-target="list"></ol>
        <datalist id="speakers" data-transcript-target="speakers"></datalist>
      </section>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "export_path") return "/talks/lecture.en.srt";
        if (command === "translation_glossary_table") return glossaryTable;
        if (command === "edit_segment" && editFailure !== undefined)
          return Promise.reject(editFailure);
        if (command === "plugin:dialog|save") return "/subtitles/out.srt";
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("progress", ProgressController);
    application.register("transcript", TranscriptController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-006
  it("lists each segment of the Project with its start and end time", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好" },
          { start_ms: 62_003, end_ms: 64_500, text: "今天天氣很好" },
        ],
      }),
    );

    const times = [
      ...document.querySelectorAll<HTMLInputElement>("li [data-edge]"),
    ].map((time) => time.value);
    expect(times).toEqual([
      "00:00:00.000",
      "00:00:01.000",
      "00:01:02.003",
      "00:01:04.500",
    ]);
    expect(fields()).toEqual(["大家好", "今天天氣很好"]);
  });

  // @behavior TL-006
  it("shows each translation under its segment", async () => {
    await hold(translated);

    expect(fields()).toEqual(["大家好", "Hello everyone"]);
  });

  // @behavior ED-006
  it("says an edit was not written when the subtitle changed elsewhere", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }] }),
    );
    editFailure = { code: "changed-elsewhere" };

    edit("textarea.text", "逐字稿");
    await settle();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["修改沒有寫入"],
      "字幕已在其他程式修改過，已重新讀取，這次的修改沒有寫入",
    ]);
  });

  // @behavior ED-007
  it("says an edit was saved", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }] }),
    );

    edit("textarea.text", "逐字稿");
    await settle();

    expect(notifications()).toEqual(["已存檔"]);
  });

  // @behavior ED-001
  it("writes an edited text to the Project", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }] }),
    );

    edit("textarea.text", "逐字稿");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "text",
      value: "逐字稿",
    });
  });

  // @behavior ED-002
  it("writes an edited translation to the Project", async () => {
    await hold(translated);

    edit("textarea.translation", "Hi all");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "translation",
      value: "Hi all",
    });
  });

  // @behavior ED-003
  it("exports the Project as a bilingual SRT", async () => {
    await hold(translated);

    document.querySelector<HTMLButtonElement>("#save-bilingual")!.click();
    await settle();

    expect(sent("save_srt")).toEqual({
      path: "/subtitles/out.srt",
      content: "bilingual",
    });
  });

  // @behavior PJ-014
  it("opens the save dialog at the default path of the export", async () => {
    await hold(translated);

    document.querySelector<HTMLButtonElement>("#save-translation")!.click();
    await settle();

    expect(sent("export_path")).toEqual({ content: "translation" });
    expect(sent("plugin:dialog|save")).toMatchObject({
      options: { defaultPath: "/talks/lecture.en.srt" },
    });
  });

  // @behavior ED-004
  it("shows the translation chosen for the Current Resource", async () => {
    await hold(translated);
    const choice = document.querySelector<HTMLSelectElement>(
      '[data-transcript-target="translationLanguage"]',
    )!;

    choice.value = "ja";
    choice.dispatchEvent(new Event("change"));
    await settle();

    expect(sent("show_translation")).toEqual({ language: "ja" });
  });

  // @behavior ED-005
  it("leaves an empty translation field for a Segment not yet translated", async () => {
    await hold(
      projectOf({
        shown_translation: "en",
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好", translation: "Hello" },
          { start_ms: 1000, end_ms: 2000, text: "今天天氣很好" },
        ],
      }),
    );

    expect(fields()).toEqual(["大家好", "Hello", "今天天氣很好", ""]);
  });

  // @behavior ED-008
  it("shows Placeholder rows until a transcription writes a Segment", async () => {
    await hold(projectOf({ segments: [] }));

    progress().begin("transcribe");
    await settle();

    expect([
      placeholders() > 0,
      document.querySelector<HTMLElement>('[data-transcript-target="empty"]')!
        .hidden,
    ]).toEqual([true, true]);
  });

  // @behavior ED-009
  it("shows a Placeholder for each translation still to come", async () => {
    await hold(
      projectOf({
        shown_translation: "en",
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好", translation: "Hello" },
          { start_ms: 1000, end_ms: 2000, text: "資料不上傳" },
        ],
      }),
    );

    progress().begin("translate");
    await settle();

    expect(
      [...document.querySelectorAll("textarea.translation")].map((field) =>
        field.classList.contains("skeleton"),
      ),
    ).toEqual([false, true]);
  });

  // @behavior ED-010
  it("shows Placeholder rows while another Resource is read", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }] }),
    );

    document
      .querySelector("ol")!
      .dispatchEvent(new CustomEvent("project:select", { bubbles: true }));

    expect([placeholders() > 0, fields()]).toEqual([true, []]);
  });

  // @behavior ED-012
  it("writes the Speaker named for a Segment to the Project", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "你好" }] }),
    );

    edit("input.speaker", "co");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "speaker",
      value: "co",
    });
  });

  // @behavior ED-013
  it("offers the Speakers already named to each Segment", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, speaker: "co", text: "你好" },
          { start_ms: 1000, end_ms: 2000, speaker: "cl", text: "嗨" },
          { start_ms: 2000, end_ms: 3000, speaker: "co", text: "再見" },
        ],
        translation_glossary: {
          file: "/talks/glossary.csv",
          term_count: 2,
          speakers: ["小明"],
        },
      }),
    );

    const offered = [...document.querySelectorAll("#speakers option")].map(
      (option) => (option as HTMLOptionElement).value,
    );
    expect([
      offered,
      document.querySelector("input.speaker")!.getAttribute("list"),
    ]).toEqual([["cl", "co", "小明"], "speakers"]);
  });

  /** A Project in `zh-TW` of one Segment, whose Translation Glossary names `speakers`. */
  function projectNaming(speakers: string[]): ProjectView {
    return projectOf({
      segments: [{ start_ms: 0, end_ms: 1000, text: "你好" }],
      translation_glossary: {
        file: "/talks/glossary.csv",
        term_count: speakers.length,
        speakers,
      },
    });
  }

  async function nameSpeaker(name: string): Promise<void> {
    edit("input.speaker", name);
    await settle();
  }

  // @behavior ED-022
  it("offers to add a new Speaker to the Translation Glossary", async () => {
    await hold(projectNaming([]));

    await nameSpeaker("co");

    expect(notificationAction(0)?.textContent).toBe("加入詞彙表");
  });

  // @behavior ED-023
  it("offers nothing for a Speaker the Translation Glossary names", async () => {
    await hold(projectNaming(["小明"]));

    await nameSpeaker("小明");

    expect(notificationAction(0)).toBeNull();
  });

  // @behavior ED-024
  it("adds a new Speaker to the Translation Glossary", async () => {
    glossaryTable.rows = [{ words: ["東京", "Tokyo", ""], is_speaker: false }];
    await hold(projectNaming([]));
    await nameSpeaker("co");

    notificationAction(0)!.click();
    await settle();

    expect(sent("save_translation_glossary")).toEqual({
      rows: [
        { words: ["東京", "Tokyo", ""], is_speaker: false },
        { words: ["co", "", ""], is_speaker: true },
      ],
    });
  });

  // @behavior ED-025
  it("marks a term already in the Translation Glossary as a Speaker", async () => {
    glossaryTable.rows = [{ words: ["co", "", ""], is_speaker: false }];
    await hold(projectNaming([]));
    await nameSpeaker("co");

    notificationAction(0)!.click();
    await settle();

    expect(sent("save_translation_glossary")).toEqual({
      rows: [{ words: ["co", "", ""], is_speaker: true }],
    });
  });
  // @behavior ED-026
  it("holds every field while the Current Resource is transcribed", async () => {
    await hold({ ...translated, running_mode: { mode: "transcription" } });

    const fields = [
      ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "li input, li textarea",
      ),
    ];
    expect(fields.length > 0 && fields.every((field) => field.disabled)).toBe(
      true,
    );
  });

  // @behavior ED-027
  it("holds only the translation while it is written", async () => {
    await hold({
      ...translated,
      running_mode: { mode: "translation", language: "en" },
    });

    const isDisabled = (selector: string) =>
      document.querySelector<HTMLTextAreaElement>(selector)!.disabled;
    expect([
      isDisabled("textarea.translation"),
      isDisabled("textarea.text"),
    ]).toEqual([true, false]);
  });
  it("names the icon that opens a Segment's changes", async () => {
    await hold(translated);

    const opener = document.querySelector("li .dropdown [role=button]");
    expect([
      opener?.getAttribute("aria-label"),
      opener?.querySelector("svg") !== null,
    ]).toEqual(["段落操作", true]);
  });
});
