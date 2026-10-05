// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "../assembly";
import type {
  ComparedRow,
  ProjectView,
  SubtitleVersions,
} from "../backend/project";
import { t } from "../i18n";
import { projectOf, resourceOf } from "../test-project";
import CompareMenu from "./CompareMenu.svelte";
import { pageContext } from "./context";
import { EditorComparison } from "./editor-comparison.svelte";
import { notifications, showNotifications } from "./test-notifications";
import { drawSegmentRows } from "./test-segment-rows";

describe("EditorComparison", () => {
  let comparison: EditorComparison;
  /** The subtitles the compare menu opened the Versions dialog at. */
  let openedSubtitles: (string | null)[];
  let project: ProjectView;
  let versions: SubtitleVersions[];
  let rows: ComparedRow[];
  let translationRows: ComparedRow[];
  let cuesByLanguage: Record<string, ReturnType<typeof cue>[]>;
  let calls: { command: string; args: unknown }[];
  let unmatchedCount: number;
  /** How `compare_versions` answers for the original; the rows at once unless a test holds them back. */
  let takeRows: () => ComparedRow[] | Promise<ComparedRow[]>;
  /** How `subtitle_versions` answers; the Backups at once unless a test holds them back. */
  let takeVersions: () => SubtitleVersions[] | Promise<SubtitleVersions[]>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const argsByCommand = (command: string) =>
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

  /** Checks `choice` in the menu, as the user does. */
  async function check(choice: HTMLInputElement): Promise<void> {
    choice.checked = true;
    choice.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  /** The menu's choice of a side's Backup `file`, or of nothing for "". */
  const backupChoice = (side: string, file: string) =>
    document.querySelector<HTMLInputElement>(
      `input[name="compare-${side}"][value="${file}"]`,
    )!;

  const compareMenu = () => document.querySelector<HTMLElement>("ul.menu")!;

  /** The menu's choice to read the translation in `language` beneath the cues. */
  const referenceChoice = (language: string) =>
    within(compareMenu()).getByRole<HTMLInputElement>("checkbox", {
      name: t(`languages.${language}`),
    });

  /** Each row's translations read beside it, as their Language and cue. */
  const references = () =>
    [...document.querySelectorAll("ol > li:not([data-ghost])")].map((item) =>
      [...item.querySelectorAll<HTMLElement>("[data-reference]")].map(
        (reference) => [
          reference.dataset.reference,
          reference.querySelector("[data-cue]")?.textContent,
        ],
      ),
    );

  /** The Project showing its `en` translation, whose Output can be compared. */
  function translatedProject(): ProjectView {
    versions.push({
      language: "en",
      backups: [
        {
          file: "ep01.en.output.srt",
          taken_at: "20260925T023100Z",
          kind: "output",
        },
      ],
    });
    return projectOf({
      resources: [resourceOf({ translation_languages: ["en"] })],
      shown_translation: "en",
      segments: [
        { start_ms: 0, end_ms: 1000, text: "您好", translation: "Hello" },
        { start_ms: 2000, end_ms: 3000, text: "再見", translation: "Bye" },
      ],
    });
  }

  async function show(): Promise<void> {
    await emit("project-changed");
    await settle();
    await settle();
  }

  beforeEach(async () => {
    calls = [];
    translationRows = [];
    cuesByLanguage = { ja: [cue(0, 1000, "こんにちは")] };
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
    document.body.innerHTML = `<main></main>`;
    showNotifications();
    openedSubtitles = [];
    unmatchedCount = 0;
    takeRows = () => rows;
    takeVersions = () => versions;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "subtitle_versions") return takeVersions();
        if (command === "compare_versions")
          return (args as { language: string | null }).language === null
            ? takeRows()
            : translationRows;
        if (command === "translation_cues")
          return cuesByLanguage[(args as { language: string }).language] ?? [];
        if (command === "revert_row")
          return { unmatched_count: unmatchedCount };
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    comparison = new EditorComparison();
    const context = pageContext(
      assembly.feed,
      assembly.session,
      undefined,
      undefined,
      comparison,
    );
    render(CompareMenu, {
      target: document.querySelector("main")!,
      props: { openVersions: (subtitle) => openedSubtitles.push(subtitle) },
      context,
    });
    drawSegmentRows(document.querySelector("main")!, context);
    // As Page compares each Project read
    assembly.feed.follow((next) => void comparison.show(next));
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior VR-023
  it("compares the editor with the newest Output", async () => {
    await show();

    expect(argsByCommand("compare_versions").pop()).toEqual({
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

  // @behavior VR-058
  it("takes the marks away at once when the Segments change in number", async () => {
    rows = [
      pair(cue(0, 1000, "你好"), cue(0, 1000, "您好")),
      pair(cue(2000, 2500, "再見"), cue(2000, 3000, "再見")),
    ];
    await show();
    const markedBefore = marks();
    takeVersions = () => new Promise(() => {});
    project = projectOf({
      segments: [
        { start_ms: 0, end_ms: 500, text: "您" },
        { start_ms: 500, end_ms: 1000, text: "好" },
        { start_ms: 2000, end_ms: 3000, text: "再見" },
      ],
    });

    await show();

    expect([markedBefore, marks()]).toEqual([
      [["文"], ["時"]],
      [[], [], []],
    ]);
  });

  // @behavior VR-054
  it("marks the rows of the comparison asked for last", async () => {
    let answerEarlier: (rows: ComparedRow[]) => void = () => {};
    takeRows = () =>
      new Promise((resolve) => {
        answerEarlier = resolve;
      });
    await show();
    takeRows = () => [pair(cue(0, 1000, "你好"), cue(0, 1000, "您好"))];
    await show();

    answerEarlier([pair(cue(0, 1000, "您好"), cue(0, 1500, "您好"))]);
    await settle();

    expect(marks()).toEqual([["文"], []]);
  });

  // @behavior VR-054
  it("compares with the Backups listed for the last Segments shown", async () => {
    let answerEarlier: (versions: SubtitleVersions[]) => void = () => {};
    takeVersions = () =>
      new Promise((resolve) => {
        answerEarlier = resolve;
      });
    await show();
    takeVersions = () => versions;
    await show();

    answerEarlier([
      {
        language: null,
        backups: [
          {
            file: "ep01.20260924T000000Z.output.srt",
            taken_at: "20260924T000000Z",
            kind: "output",
          },
        ],
      },
    ]);
    await settle();

    expect(argsByCommand("compare_versions").pop()).toEqual({
      language: null,
      left: "ep01.20260925T023000Z.output.srt",
      right: null,
    });
  });

  // @behavior VR-025
  it("shows what a changed text read before", async () => {
    await show();

    expect(document.querySelector("li [data-earlier-text]")?.textContent).toBe(
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
    ]).toEqual([3, true, expect.stringContaining("已刪除（原文）：世界")]);
  });

  // @behavior VR-027
  it("takes back a row from the editor", async () => {
    await show();

    document.querySelector<HTMLButtonElement>("li .revert-text")!.click();
    await settle();

    expect([argsByCommand("revert_row"), notifications()]).toEqual([
      [
        {
          language: null,
          backup: "ep01.20260925T023000Z.output.srt",
          row: 0,
          part: "text",
        },
      ],
      ["已還原"],
    ]);
  });

  // @behavior VR-048
  it("points at the Segments a row taken back leaves without a translation", async () => {
    unmatchedCount = 2;
    await show();

    document.querySelector<HTMLButtonElement>("li .revert-text")!.click();
    await settle();

    expect(notifications()).toEqual(["已還原", "2 段對不上譯文"]);
  });

  // @behavior VR-028
  it("compares with nothing", async () => {
    await show();

    await check(backupChoice("original", ""));

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

    expect(argsByCommand("compare_versions").pop()).toEqual({
      language: null,
      left: "ep01.20260925T040000Z.output.srt",
      right: null,
    });
  });

  // @behavior VR-049
  it("keeps comparing with nothing once an edit is written", async () => {
    await show();
    await check(backupChoice("original", ""));
    const comparedCount = argsByCommand("compare_versions").length;

    await show();

    expect([
      argsByCommand("compare_versions").length,
      marks(),
      document.querySelector<HTMLInputElement>(
        'input[name="compare-original"]:checked',
      )!.value,
    ]).toEqual([comparedCount, [[], []], ""]);
  });

  // @behavior VR-049
  it("keeps comparing with nothing once a newer Output is kept", async () => {
    await show();
    await check(backupChoice("original", ""));
    const comparedCount = argsByCommand("compare_versions").length;
    versions[0].backups.unshift({
      file: "ep01.20260925T040000Z.output.srt",
      taken_at: "20260925T040000Z",
      kind: "output",
    });

    await show();

    expect(argsByCommand("compare_versions").length).toBe(comparedCount);
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
    const isEnglishOffered = () =>
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[name="compare-translation"]',
        ),
      ].some((choice) => choice.value.includes("ep01.en."));
    const beforeShown = isEnglishOffered();
    project = { ...project, shown_translation: "en" };

    await show();

    expect([beforeShown, isEnglishOffered()]).toEqual([false, true]);
  });
  // @behavior VR-038
  it("offers the other translations to read beside the cues", async () => {
    project = {
      ...project,
      resources: [resourceOf({ translation_languages: ["en", "ja"] })],
      shown_translation: "en",
    };

    await show();

    expect(
      within(compareMenu())
        .getAllByRole("checkbox")
        .map((choice) => choice.closest("label")?.textContent?.trim()),
    ).toEqual([t("languages.ja")]);
  });

  // @behavior VR-039
  it("shows a translation beside each cue", async () => {
    project = {
      ...project,
      resources: [resourceOf({ translation_languages: ["ja"] })],
    };
    await show();

    await check(referenceChoice("ja"));

    expect(references()).toEqual([[["ja", "こんにちは"]], []]);
  });

  // @behavior VR-053
  it("shows a translation beside cues with the same times in their order", async () => {
    cuesByLanguage = { en: [cue(0, 1000, "Hello"), cue(0, 1000, "Yeah")] };
    project = projectOf({
      resources: [resourceOf({ translation_languages: ["en"] })],
      segments: [
        { start_ms: 0, end_ms: 1000, text: "大家好" },
        { start_ms: 0, end_ms: 1000, text: "對啊" },
      ],
    });
    await show();

    await check(referenceChoice("en"));

    expect(references()).toEqual([[["en", "Hello"]], [["en", "Yeah"]]]);
  });

  // @behavior VR-040
  it("marks each comparison beside the text field it compares", async () => {
    project = translatedProject();
    rows = [pair(cue(0, 1000, "你好"), cue(0, 1000, "您好"))];
    translationRows = [pair(cue(0, 1000, "Hi"), cue(0, 1000, "Hello"))];
    await show();

    await check(backupChoice("translation", "ep01.en.output.srt"));

    const first = document.querySelector("ol > li")!;
    const markedField = (side: string) =>
      first.querySelector(`[data-marks="${side}"]`)?.nextElementSibling
        ?.firstElementChild?.classList;
    expect([
      markedField("original")?.contains("text"),
      markedField("translation")?.contains("translation"),
    ]).toEqual([true, true]);
  });

  // @behavior VR-041
  it("reads several translations beneath the cues", async () => {
    project = {
      ...project,
      resources: [resourceOf({ translation_languages: ["ja", "en"] })],
    };
    cuesByLanguage.en = [cue(0, 1000, "Hello")];
    await show();

    await check(referenceChoice("ja"));
    await check(referenceChoice("en"));

    expect(references()[0]).toEqual([
      ["ja", "こんにちは"],
      ["en", "Hello"],
    ]);
  });

  // @behavior VR-042
  it("offers the Output, nothing, and the Versions dialog for the rest", async () => {
    versions[0].backups.push(
      {
        file: "ep01.20260925T010000Z.srt",
        taken_at: "20260925T010000Z",
        kind: "overwrite",
      },
      {
        file: "ep01.20260925T000000Z.srt",
        taken_at: "20260925T000000Z",
        kind: "overwrite",
      },
    );

    await show();

    expect([
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[name="compare-original"]',
        ),
      ].map((choice) => choice.value),
      screen.getAllByRole("button", { name: "從版本選……" }).length,
    ]).toEqual([["ep01.20260925T023000Z.output.srt", ""], 1]);
  });

  // @behavior VR-043
  it("compares with the Backup the Versions dialog sets", async () => {
    await show();

    await comparison.compareWith(null, "ep01.20260925T030000Z.srt");
    await settle();

    expect([
      argsByCommand("compare_versions").pop(),
      document.querySelector<HTMLInputElement>(
        'input[name="compare-original"]:checked',
      )?.value,
    ]).toEqual([
      { language: null, left: "ep01.20260925T030000Z.srt", right: null },
      "ep01.20260925T030000Z.srt",
    ]);
  });

  // @behavior VR-044
  it("compares the translation with nothing once another is shown", async () => {
    project = translatedProject();
    await show();
    await check(backupChoice("translation", "ep01.en.output.srt"));

    project = { ...project, shown_translation: "ja" };
    await show();

    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="compare-translation"]:checked',
      )?.value,
    ).toBe("");
  });

  // @behavior VR-045
  it("marks the characters a text gained inside its field", async () => {
    const highlights = new Map<string, { ranges: Range[] }>();
    vi.stubGlobal("CSS", { highlights });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
    project = projectOf({
      segments: [{ start_ms: 0, end_ms: 1000, text: "資料不會上傳" }],
    });
    rows = [
      {
        ...pair(cue(0, 1000, "資料不上傳"), cue(0, 1000, "資料不會上傳")),
        text_spans: [
          { kind: "common", text: "資料不" },
          { kind: "addition", text: "會" },
          { kind: "common", text: "上傳" },
        ],
      },
    ];

    await show();

    expect([
      highlights.get("compare-addition")?.ranges.map(String),
      document.querySelector("[data-earlier-text]")?.textContent,
    ]).toEqual([["會"], "原：資料不上傳"]);
  });

  // @behavior VR-046
  it("says a removed cue was removed from the translation", async () => {
    project = translatedProject();
    translationRows = [
      {
        kind: "removal",
        left: [cue(1000, 2000, "World")],
        right: [],
        is_text_changed: false,
        is_time_changed: false,
        text_spans: [],
      },
    ];
    await show();

    await check(backupChoice("translation", "ep01.en.output.srt"));

    expect(
      document.querySelector('[data-ghost="translation"]')?.textContent,
    ).toContain("已刪除（English）：World");
  });
});
