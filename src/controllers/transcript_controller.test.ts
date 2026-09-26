// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { GlossaryTable, ProjectView } from "../backend/project";
import { projectOf, resourceOf } from "../test_project";
import { fieldValue, isFieldHeld } from "../editor";
import FieldController from "./field_controller";
import NotificationController from "./notification_controller";
import ProgressController from "./progress_controller";
import {
  NOTIFICATION_STACK,
  notificationAction,
  notificationDetail,
  notifications,
} from "../ui/test_notification";
import { SAVE_MARK, saveMark } from "../ui/test_save_mark";
import SpeakersController from "./speakers_controller";
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
    return [...document.querySelectorAll<HTMLElement>("li .field")].map(
      fieldValue,
    );
  }

  /** Types `value` into the text field or input `selector` names and leaves it, as the user does. */
  function edit(selector: string, value: string): void {
    const field = document.querySelector<HTMLElement>(selector)!;
    if (field instanceof HTMLInputElement) {
      field.value = value;
      field.dispatchEvent(new Event("change"));
      return;
    }
    field.dispatchEvent(new FocusEvent("focus"));
    field.textContent = value;
    field.dispatchEvent(new FocusEvent("blur"));
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
      ${SAVE_MARK}
      <section data-controller="transcript speakers"
        data-action="progress:task->transcript#followTask project:select->transcript#showLoading transcript:shown->speakers#follow">
        <div id="progress" data-controller="progress" hidden>
          <span data-progress-target="summary"></span>
          <ul data-progress-target="steps"></ul>
          <p data-progress-target="status"></p>
          <progress data-progress-target="bar" hidden></progress>
        </div>
        <h2 data-transcript-target="heading"></h2>
        <select data-transcript-target="translationLanguage" data-action="change->transcript#showTranslation"></select>
        <p data-transcript-target="emptyHint">尚無內容</p>
        <div class="dropdown">
          <div tabindex="0" role="button">匯出</div>
          <button id="save-original" data-transcript-target="exportButton" data-action="transcript#save" data-transcript-content-param="original" disabled>原文</button>
          <button id="save-translation" data-transcript-target="exportButton" data-action="transcript#save" data-transcript-content-param="translation" disabled>譯文</button>
          <button id="save-bilingual" data-transcript-target="exportButton" data-action="transcript#save" data-transcript-content-param="bilingual" disabled>雙語</button>
        </div>
        <ol data-transcript-target="list"></ol>
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
    await assemble(application, {
      field: FieldController,
      notification: NotificationController,
      progress: ProgressController,
      speakers: SpeakersController,
      transcript: TranscriptController,
    }).start();
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

    edit(".field.text", "逐字稿");
    await settle();

    expect([notifications(), notificationDetail(0)]).toEqual([
      ["修改沒有寫入"],
      "字幕已在其他程式修改過，已重新讀取，這次的修改沒有寫入",
    ]);
  });

  // @behavior ED-007
  it("marks an edit as saved rather than notifying it", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }] }),
    );

    edit(".field.text", "逐字稿");
    await settle();

    expect(saveMark()).toBe("已存檔");
    expect(notifications()).toEqual([]);
  });

  // @behavior ED-001
  it("writes an edited text to the Project", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }] }),
    );

    edit(".field.text", "逐字稿");
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

    edit(".field.translation", "Hi all");
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

    progress().begin("transcription");
    await settle();

    expect([
      placeholders() > 0,
      document.querySelector<HTMLElement>(
        '[data-transcript-target="emptyHint"]',
      )!.hidden,
    ]).toEqual([true, true]);
  });

  // @behavior ED-009
  it("shows a Placeholder over the Batch being translated", async () => {
    await hold(
      projectOf({
        shown_translation: "en",
        running_mode: { mode: "translation", language: "en", indexes: null },
        pending_batch: { first: 0, last: 1 },
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家好" },
          { start_ms: 1000, end_ms: 2000, text: "資料不上傳" },
          { start_ms: 2000, end_ms: 3000, text: "謝謝" },
        ],
      }),
    );

    expect(
      [...document.querySelectorAll(".field.translation")].map((field) =>
        field.classList.contains("skeleton"),
      ),
    ).toEqual([true, true, false]);
  });

  // @behavior ED-038
  it("holds a Placeholder after the last Segment while transcribing", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }] }),
    );

    progress().begin("transcription");
    await settle();

    const rows = [...document.querySelectorAll("ol > li")];
    expect(rows.map((row) => row.hasAttribute("data-placeholder"))).toEqual([
      false,
      true,
    ]);
  });

  // @behavior ED-041
  it("shows each Batch's translations as they are written", async () => {
    const texts = Array.from({ length: 15 }, (_, at) => `第${at}句`);
    const translatedUpTo = (done: number) =>
      projectOf({
        shown_translation: "en",
        running_mode: { mode: "translation", language: "en", indexes: null },
        segments: texts.map((text, at) => ({
          start_ms: at * 1000,
          end_ms: (at + 1) * 1000,
          text,
          ...(at < done ? { translation: `line ${at}` } : {}),
        })),
      });
    progress().begin("translation");
    await hold(translatedUpTo(0));

    await hold(translatedUpTo(6));

    const translations = [
      ...document.querySelectorAll(".field.translation"),
    ].map((field) => field.textContent);
    expect([translations.slice(0, 6), translations.slice(6)]).toEqual([
      texts.slice(0, 6).map((_, at) => `line ${at}`),
      Array(9).fill(""),
    ]);
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

  /** Opens the Speaker menu of the Segment at `index`, as focusing its button does. */
  function openSpeakers(index = 0): HTMLElement {
    const opener = document.querySelectorAll<HTMLElement>(".speaker")[index];
    opener.dispatchEvent(new FocusEvent("focus"));
    return opener.parentElement!;
  }

  /** The names a Speaker menu offers, the chosen one marked with `*`. */
  const offeredSpeakers = (menu: HTMLElement) =>
    [...menu.querySelectorAll<HTMLButtonElement>(".speakers button")].map(
      (button) =>
        `${button.textContent}${button.classList.contains("menu-active") ? "*" : ""}`,
    );

  async function nameSpeaker(name: string): Promise<void> {
    const input =
      openSpeakers().querySelector<HTMLInputElement>(".new-speaker")!;
    input.value = name;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await settle();
  }

  async function chooseSpeaker(label: string, index = 0): Promise<void> {
    const menu = openSpeakers(index);
    await settle();
    [...menu.querySelectorAll<HTMLButtonElement>(".speakers button")]
      .find((button) => button.textContent === label)!
      .click();
    await settle();
  }

  const saidBy = (...speakers: string[]) =>
    projectOf({
      segments: speakers.map((speaker, at) => ({
        start_ms: at * 1000,
        end_ms: (at + 1) * 1000,
        speaker,
        text: "你好",
      })),
    });

  // @behavior ED-012
  it("writes a new Speaker named for a Segment to the Project", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "你好" }] }),
    );

    await nameSpeaker("co");

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "speaker",
      value: "co",
    });
  });

  // @behavior ED-013
  it("offers every Speaker whatever a Segment names", async () => {
    await hold(
      projectOf({
        ...saidBy("co", "cl", "co"),
        translation_glossary: {
          file: "/talks/glossary.csv",
          term_count: 2,
          speakers: ["小明"],
        },
      }),
    );

    const menu = openSpeakers(0);

    expect(offeredSpeakers(menu)).toEqual(["cl", "co*", "小明", "清除說話者"]);
  });

  // @behavior ED-032
  it("chooses a Speaker from the menu", async () => {
    await hold(saidBy("co", "cl"));

    await chooseSpeaker("cl");

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "speaker",
      value: "cl",
    });
  });

  // @behavior ED-033
  it("clears a Segment's Speaker", async () => {
    await hold(saidBy("co"));

    await chooseSpeaker("清除說話者");

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "speaker",
      value: "",
    });
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

    expect(saveMark()).toBe("已存檔");
    expect(notifications()).toEqual([]);
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

    const inputs = [...document.querySelectorAll<HTMLInputElement>("li input")];
    const textFields = [...document.querySelectorAll<HTMLElement>("li .field")];
    const speakers = [...document.querySelectorAll<HTMLElement>("li .speaker")];
    expect(
      inputs.length > 0 &&
        textFields.length > 0 &&
        speakers.length > 0 &&
        inputs.every((input) => input.disabled) &&
        textFields.every(isFieldHeld) &&
        speakers.every((speaker) => speaker.classList.contains("btn-disabled")),
    ).toBe(true);
  });

  // @behavior ED-027
  it("holds only the translation while it is written", async () => {
    await hold({
      ...translated,
      running_mode: { mode: "translation", language: "en", indexes: null },
    });

    const isHeld = (selector: string) =>
      isFieldHeld(document.querySelector<HTMLElement>(selector)!);
    expect([isHeld(".field.translation"), isHeld(".field.text")]).toEqual([
      true,
      false,
    ]);
  });
  // @behavior ED-092
  it("holds only the translations of the Segments translated again", async () => {
    await hold({
      ...translated,
      running_mode: { mode: "translation", language: "en", indexes: [1] },
      segments: [
        { start_ms: 0, end_ms: 1000, text: "你好", translation: "Hello" },
        { start_ms: 1000, end_ms: 2000, text: "世界", translation: "World" },
      ],
    });

    const translations = [
      ...document.querySelectorAll<HTMLElement>("li .field.translation"),
    ];
    expect(translations.map(isFieldHeld)).toEqual([false, true]);
  });

  // @behavior ED-093
  it("holds the choice of translation while a Mode runs", async () => {
    await hold({
      ...translated,
      running_mode: { mode: "translation", language: "en", indexes: null },
    });

    expect(
      document.querySelector<HTMLSelectElement>(
        '[data-transcript-target="translationLanguage"]',
      )!.disabled,
    ).toBe(true);
  });

  it("names the icon that opens a Segment's changes", async () => {
    await hold(translated);

    const opener = document.querySelector("li .dropdown-left [role=button]");
    expect([
      opener?.getAttribute("aria-label"),
      opener?.querySelector("svg") !== null,
    ]).toEqual(["段落操作", true]);
  });

  // @behavior ED-096
  it("shows the split shortcut beside splitting in a Segment's menu", async () => {
    await hold(translated);

    expect(document.querySelector("li button.split kbd")?.textContent).toBe(
      "Ctrl+Alt+Enter",
    );
  });

  // @behavior ED-107
  it("shows the delete shortcut beside deleting in a Segment's menu", async () => {
    await hold(translated);

    expect(document.querySelector("li button.delete kbd")?.textContent).toBe(
      "Delete",
    );
  });
});
