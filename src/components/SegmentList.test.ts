// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "#/assembly.ts";
import type { GlossaryTable, ProjectView } from "#/ipc/project.ts";
import { projectOf, resourceOf } from "#/testing/project.ts";
import { fieldValue, isFieldHeld } from "#/editor/index.ts";
import {
  showNotifications,
  notificationAction,
  notificationDetail,
  notifications,
} from "#/testing/notifications.ts";
import { pageContext } from "#/state/context.ts";
import { saveMark } from "#/state/save-mark.svelte.ts";
import { Playback } from "#/state/playback.svelte.ts";
import { ViewChoices } from "#/state/view-choices.svelte.ts";
import { ResourcePlaceholders } from "#/state/resource-placeholders.svelte.ts";
import SegmentList from "#/components/SegmentList.svelte";
import { TaskRun } from "#/state/task-run.svelte.ts";
import { rowList, segmentRows } from "#/testing/segment-rows.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import { settle } from "#/testing/settle.ts";

describe("SegmentList", () => {
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  let editFailure: unknown;
  let glossaryTable: GlossaryTable;

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

  let run: TaskRun;
  let segmentList: SegmentList;
  let resourcePlaceholders: ResourcePlaceholders;
  /** What the View menu chooses, the Speaker column among it. */
  let viewChoices: ViewChoices;

  const placeholders = () =>
    document.querySelectorAll("[data-placeholder]").length;

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  const translatedProject: ProjectView = projectOf({
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
    saveMark.isShown = false;
    localStorage.clear();
    glossaryTable = {
      languages: ["zh-TW", "en", "ja"],
      rows: [],
      has_source_target_header: false,
    };
    document.body.innerHTML = `<section></section>`;
    showNotifications();
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "translation_glossary_table") return glossaryTable;
        if (command === "find_text") {
          const { pattern } = (args as { search: { pattern: string } }).search;
          return (project?.segments ?? []).flatMap((segment, index) => {
            const start = segment.text.indexOf(pattern);
            return start === -1
              ? []
              : [{ index, start, end: start + pattern.length }];
          });
        }
        if (command === "edit_segment" && editFailure !== undefined)
          return Promise.reject(editFailure);
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    run = new TaskRun();
    const context = pageContext(assembly.feed, assembly.session, run);
    resourcePlaceholders = new ResourcePlaceholders();
    viewChoices = new ViewChoices();
    segmentList = renderFollowingProject(SegmentList, assembly.feed, {
      target: document.querySelector("section")!,
      props: {
        playback: new Playback(),
        placeholders: resourcePlaceholders,
        viewChoices,
      },
      context,
    });
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior ED-142
  it("searches again as the Segments change", async () => {
    const commaSegments = [
      { start_ms: 0, end_ms: 1000, text: "你好，世界" },
      { start_ms: 1000, end_ms: 2000, text: "好，走吧" },
    ];
    await hold(projectOf({ segments: commaSegments }));
    segmentList.openSearch();
    flushSync();
    const patternBox = screen.getByRole<HTMLInputElement>("searchbox", {
      name: "搜尋文字",
    });
    patternBox.value = "，";
    patternBox.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "你好世界" },
          commaSegments[1],
        ],
      }),
    );
    await settle();

    expect(screen.getByRole("status").textContent).toBe("1/1");
  });

  // @behavior ED-118
  it("keeps the rows already drawn when a Segment is split", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "你好世界" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
        ],
      }),
    );
    const drawnRows = segmentRows();

    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 500, text: "你好" },
          { start_ms: 500, end_ms: 1000, text: "世界" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
        ],
      }),
    );

    const rows = segmentRows();
    expect([
      rows.length,
      rows[0] === drawnRows[0],
      rows[1] === drawnRows[1],
    ]).toEqual([3, true, true]);
  });

  /** Two Segments, the second reading `text`, so a change to it leaves their number alone. */
  const projectWithSecondText = (text: string) =>
    projectOf({
      segments: [
        { start_ms: 0, end_ms: 1000, text: "大家" },
        { start_ms: 1000, end_ms: 2000, text },
      ],
    });

  // @behavior ED-189
  it("keeps a text being typed as the Project is shown anew", async () => {
    await hold(projectWithSecondText("今天"));
    const field = document.querySelector<HTMLElement>(".field.text")!;
    field.focus();
    field.textContent = "你好";

    await hold(projectWithSecondText("明天"));

    expect(fieldValue(field)).toBe("你好");
  });

  // @behavior ED-190
  it("keeps a time being typed as the Project is shown anew", async () => {
    await hold(projectWithSecondText("今天"));
    const start = document.querySelector<HTMLInputElement>("input.start")!;
    start.focus();
    start.value = "00:00:00.300";

    await hold(projectWithSecondText("明天"));

    expect(start.value).toBe("00:00:00.300");
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
    await hold(translatedProject);

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

    expect(saveMark.isShown).toBe(true);
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
    await hold(translatedProject);

    edit(".field.translation", "Hi all");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "translation",
      value: "Hi all",
    });
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

    run.begin("transcription");
    await settle();

    expect([
      placeholders() > 0,
      screen.queryByText("尚無內容") === null,
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

    run.begin("transcription");
    await settle();

    const rows = [...rowList().children];
    expect(rows.map((row) => row.hasAttribute("data-placeholder"))).toEqual([
      false,
      true,
    ]);
  });

  // @behavior ED-041
  it("shows each Batch's translations as they are written", async () => {
    const texts = Array.from({ length: 15 }, (_, at) => `第${at}句`);
    const translatedUpTo = (translatedCount: number) =>
      projectOf({
        shown_translation: "en",
        running_mode: { mode: "translation", language: "en", indexes: null },
        segments: texts.map((text, at) => ({
          start_ms: at * 1000,
          end_ms: (at + 1) * 1000,
          text,
          ...(at < translatedCount ? { translation: `line ${at}` } : {}),
        })),
      });
    run.begin("translation");
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

    resourcePlaceholders.show();
    flushSync();

    expect([placeholders() > 0, fields()]).toEqual([true, []]);
  });

  // @behavior ED-010
  it("puts the Placeholder rows away once the other Resource is read", async () => {
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }] }),
    );
    resourcePlaceholders.show();
    flushSync();

    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "第二集" }] }),
    );

    expect([placeholders(), fields()[0]]).toEqual([0, "第二集"]);
  });

  /** Opens the Speaker menu of the Segment at `index`, as focusing its button does. */
  function openSpeakers(index = 0): HTMLElement {
    const opener = document.querySelectorAll<HTMLElement>(".speaker")[index];
    opener.dispatchEvent(new FocusEvent("focus"));
    flushSync();
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
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
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
    viewChoices.toggleSpeakerColumn();
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

  // @behavior ED-191
  it("leaves Enter to an input method composing a new Speaker name", async () => {
    viewChoices.toggleSpeakerColumn();
    await hold(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "你好" }] }),
    );
    const input =
      openSpeakers().querySelector<HTMLInputElement>(".new-speaker")!;
    input.value = "小明";

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(enter);
    await settle();

    expect([sent("edit_segment"), enter.defaultPrevented]).toEqual([
      undefined,
      false,
    ]);
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
    viewChoices.toggleSpeakerColumn();
    await hold(projectNaming([]));

    await nameSpeaker("co");

    expect(notificationAction(0)?.textContent).toBe("加入詞彙表");
  });

  // @behavior ED-023
  it("offers nothing for a Speaker the Translation Glossary names", async () => {
    viewChoices.toggleSpeakerColumn();
    await hold(projectNaming(["小明"]));

    await nameSpeaker("小明");

    expect(saveMark.isShown).toBe(true);
    expect(notifications()).toEqual([]);
  });

  // @behavior ED-024
  it("adds a new Speaker to the Translation Glossary", async () => {
    viewChoices.toggleSpeakerColumn();
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
    viewChoices.toggleSpeakerColumn();
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
    viewChoices.toggleSpeakerColumn();
    await hold(translatedProject);
    await hold({
      ...translatedProject,
      running_mode: { mode: "transcription" },
    });

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
      ...translatedProject,
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
      ...translatedProject,
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

  it("names the icon that opens a Segment's changes", async () => {
    await hold(translatedProject);

    const opener = document.querySelector("li .dropdown-left [role=button]");
    expect([
      opener?.getAttribute("aria-label"),
      opener?.querySelector("svg") !== null,
    ]).toEqual(["段落操作", true]);
  });

  // @behavior ED-096
  it("shows the split shortcut beside splitting in a Segment's menu", async () => {
    await hold(translatedProject);

    expect(document.querySelector("li button.split kbd")?.textContent).toBe(
      "Ctrl+Alt+Enter",
    );
  });

  // @behavior ED-181
  it("shows the merge shortcuts beside merging in a Segment's menu", async () => {
    await hold(projectWithSecondText("今天"));

    expect(
      [".mergeWithPrevious", ".mergeWithNext"].map(
        (choice) =>
          document.querySelector(`li button${choice} kbd`)?.textContent,
      ),
    ).toEqual(["Ctrl+Alt+↑", "Ctrl+Alt+↓"]);
  });

  // @behavior ED-107
  it("shows the delete shortcut beside deleting in a Segment's menu", async () => {
    await hold(translatedProject);

    expect(document.querySelector("li button.delete kbd")?.textContent).toBe(
      "Delete",
    );
  });

  const speakerMenus = () => document.querySelectorAll(".speaker-menu").length;
  const twoSegments = (speaker?: string) =>
    projectOf({
      segments: [
        { start_ms: 0, end_ms: 1000, text: "你好" },
        { start_ms: 1000, end_ms: 2000, text: "世界", speaker },
      ],
    });

  // @behavior ED-193
  it("leaves out the Speaker column where no Segment names a Speaker", async () => {
    await hold(twoSegments());

    expect(speakerMenus()).toBe(0);
  });

  // @behavior ED-194
  it("shows the Speaker column once a Segment names a Speaker", async () => {
    await hold(twoSegments("小明"));

    expect(speakerMenus()).toBe(2);
  });

  // @behavior ED-195
  it("shows the Speaker column as the View menu turns it on", async () => {
    await hold(twoSegments());

    viewChoices.toggleSpeakerColumn();
    flushSync();

    expect(speakerMenus()).toBe(2);
  });

  // @behavior ED-196
  it("keeps the Speaker column on for the next time the app opens", () => {
    viewChoices.toggleSpeakerColumn();

    expect(new ViewChoices().isSpeakerColumnShown).toBe(true);
  });
});
