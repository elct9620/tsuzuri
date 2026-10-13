// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble } from "#/assembly.ts";
import type { GlossaryTable, ProjectView } from "#/ipc/project.ts";
import { projectOf, resourceOf } from "#/testing/project.ts";
import {
  type EditingSession,
  fieldValue,
  isFieldHeld,
} from "#/editor/index.ts";
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
import {
  openChangeMenu,
  rowList,
  segmentRows,
} from "#/testing/segment-rows.ts";
import { renderFollowingProject } from "#/testing/following-project.ts";
import {
  type LaidOutSegmentList,
  layOutSegmentList,
  stubResizeObserver,
  type WatchedResizes,
} from "#/testing/layout.ts";
import { settle } from "#/testing/settle.ts";
import { stubHighlights } from "#/testing/highlights.ts";

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
  /** Draws the Segment list into the page's section, following the Projects read. */
  let drawList: () => void;
  let session: EditingSession;
  let playback: Playback;
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
    session = assembly.session;
    playback = new Playback();
    const context = pageContext(assembly.feed, assembly.session, run);
    resourcePlaceholders = new ResourcePlaceholders();
    viewChoices = new ViewChoices();
    drawList = () => {
      segmentList = renderFollowingProject(SegmentList, assembly.feed, {
        target: document.querySelector("section")!,
        props: {
          playback,
          placeholders: resourcePlaceholders,
          viewChoices,
        },
        context,
      });
    };
    drawList();
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

  // @behavior ED-198
  it("writes whether a field takes typing only when that changes", async () => {
    const segments = [
      { start_ms: 0, end_ms: 1000, text: "大家" },
      { start_ms: 1000, end_ms: 2000, text: "今天" },
      { start_ms: 2000, end_ms: 3000, text: "很好" },
    ];
    await hold(projectOf({ segments }));
    const writes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => writes.push(...records));
    observer.observe(document.body, {
      subtree: true,
      attributeFilter: ["contenteditable", "aria-disabled"],
    });

    await hold(
      projectOf({
        segments: [
          segments[0],
          { start_ms: 1000, end_ms: 3000, text: "今天很好" },
        ],
      }),
    );
    writes.push(...observer.takeRecords());
    observer.disconnect();

    expect(writes).toEqual([]);
  });

  // @behavior ED-199
  it("draws a row's change menu only once it is opened", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
          { start_ms: 2000, end_ms: 3000, text: "很好" },
        ],
      }),
    );
    const choiceCounts = () =>
      segmentRows().map(
        (row) => row.querySelectorAll(".change-menu button").length,
      );
    const unopenedCounts = choiceCounts();

    openChangeMenu(segmentRows()[1]);

    const [first, second, third] = choiceCounts();
    expect([unopenedCounts, first, second > 0, third]).toEqual([
      [0, 0, 0],
      0,
      true,
      0,
    ]);
  });

  // @behavior ED-200
  it("writes a row's times and texts only when they change", async () => {
    const segments = [
      { start_ms: 0, end_ms: 1000, text: "大家" },
      { start_ms: 1000, end_ms: 2000, text: "今天" },
      { start_ms: 2000, end_ms: 3000, text: "很好" },
    ];
    await hold(projectOf({ segments }));
    const valueWrite = vi.spyOn(HTMLInputElement.prototype, "value", "set");
    const textWrites: MutationRecord[] = [];
    const observer = new MutationObserver((records) =>
      textWrites.push(...records),
    );
    observer.observe(rowList(), { subtree: true, childList: true });

    await hold(
      projectOf({
        segments: segments.map((segment, index) =>
          index === 1 ? { ...segment, text: "明天" } : { ...segment },
        ),
      }),
    );
    textWrites.push(...observer.takeRecords());
    observer.disconnect();
    const timeWrites = valueWrite.mock.contexts.filter((input) =>
      (input as HTMLInputElement).matches("[data-edge]"),
    );
    valueWrite.mockRestore();

    const writtenFields = new Set(
      textWrites.map((record) => (record.target as HTMLElement).dataset.index),
    );
    expect([timeWrites.length, [...writtenFields]]).toEqual([0, ["1"]]);
  });

  /** A Project of 200 Segments, each a second long. */
  const longProject = () =>
    projectOf({
      segments: Array.from({ length: 200 }, (_, index) => ({
        start_ms: index * 1000,
        end_ms: index * 1000 + 1000,
        text: `第 ${index} 段`,
      })),
    });

  /** The rows scrolled into view while `act` runs. */
  async function scrolledRowsWhile(act: () => void): Promise<Element[]> {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    act();
    await settle();
    const rows = scroll.mock.contexts as Element[];
    scroll.mockRestore();
    return rows;
  }

  /**
   * Scrolls the list from its first row to its last, the browser drawing each row 40 pixels tall,
   * as `observers` report it once the rows are laid out.
   */
  function scrollThroughAt40(
    layout: LaidOutSegmentList,
    observers: WatchedResizes[],
  ): void {
    const measure = () => {
      const { targets, notify } = observers[observers.length - 1];
      notify(
        targets.map(
          (target) =>
            ({
              target,
              borderBoxSize: [{ blockSize: 40, inlineSize: 600 }],
            }) as unknown as ResizeObserverEntry,
        ),
      );
      flushSync();
    };
    measure();
    for (let top = 0; top <= 200 * 40; top += 400) {
      layout.scrollTo(top);
      flushSync();
      measure();
    }
  }

  /** The height of the space standing in for the rows before the first one drawn. */
  const spaceBeforeDrawn = () =>
    rowList().querySelector<HTMLElement>(":scope > li[data-gap]:first-child")
      ?.style.height;

  /** The positions of the Segments whose rows are drawn. */
  const drawnIndexes = () =>
    segmentRows().map((row) => Number(row.getAttribute("aria-posinset")) - 1);

  // @behavior ED-202
  it("draws only the rows near the view as the list is scrolled", async () => {
    const layout = layOutSegmentList();
    try {
      await hold(longProject());

      layout.scrollTo(8000);
      flushSync();

      const drawn = drawnIndexes();
      expect([
        drawn.includes(100),
        drawn.includes(0),
        drawn.includes(199),
      ]).toEqual([true, false, false]);
    } finally {
      layout.restore();
    }
  });

  // @behavior ED-204
  it("stands in for the rows scrolled past with the height they were drawn at", async () => {
    const observers = stubResizeObserver();
    const layout = layOutSegmentList();
    try {
      await hold(longProject());

      scrollThroughAt40(layout, observers);

      expect(spaceBeforeDrawn()).toBe(`${drawnIndexes()[0] * 40}px`);
    } finally {
      layout.restore();
      vi.unstubAllGlobals();
    }
  });

  // @behavior ED-205
  it("keeps the Current Segment's row drawn as the list scrolls away", async () => {
    const layout = layOutSegmentList();
    try {
      await hold(longProject());
      const typed = segmentRows()[0].querySelector<HTMLElement>(".field.text")!;
      typed.focus();
      typed.dispatchEvent(new FocusEvent("focus"));
      typed.textContent = "改過";
      await settle();

      layout.scrollTo(8000);
      flushSync();

      const first = segmentRows()[0];
      expect([
        first.getAttribute("aria-posinset"),
        fieldValue(first.querySelector<HTMLElement>(".field.text")!),
        drawnIndexes().includes(100),
      ]).toEqual(["1", "改過", true]);
    } finally {
      layout.restore();
    }
  });

  // @behavior ED-206
  it("brings a Segment left out into view as it becomes current", async () => {
    const layout = layOutSegmentList();
    try {
      await hold(longProject());

      const scrolled = await scrolledRowsWhile(() => session.makeCurrent(149));

      expect(
        scrolled.map((row) => row.getAttribute("aria-posinset")),
      ).toContain("150");
    } finally {
      layout.restore();
    }
  });

  // @behavior PV-217
  it("brings a row left out into view while following playback", async () => {
    const layout = layOutSegmentList();
    try {
      await hold(longProject());
      playback.isFollowing = true;

      const scrolled = await scrolledRowsWhile(
        () => (playback.playingIndexes = [149]),
      );

      expect(
        scrolled.map((row) => row.getAttribute("aria-posinset")),
      ).toContain("150");
    } finally {
      layout.restore();
    }
  });

  // @behavior ED-207
  it("enters the next Segment's text with Enter far from the view", async () => {
    const layout = layOutSegmentList();
    try {
      await hold(longProject());
      const first = segmentRows()[0].querySelector<HTMLElement>(".field.text")!;
      first.focus();
      first.dispatchEvent(new FocusEvent("focus"));
      await settle();
      layout.scrollTo(8000);
      flushSync();

      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await settle();

      const entered = document.activeElement as HTMLElement;
      expect([
        entered.matches(".field.text"),
        entered.closest("li")?.getAttribute("aria-posinset"),
      ]).toEqual([true, "2"]);
    } finally {
      layout.restore();
    }
  });

  // @behavior ED-208
  it("brings a row into view below the bars above the list", async () => {
    // The bars are measured as the list is drawn
    cleanup();
    const barsHeight = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(48);
    try {
      drawList();
      await hold(
        projectOf({
          segments: [
            { start_ms: 0, end_ms: 1000, text: "大家" },
            { start_ms: 1000, end_ms: 2000, text: "今天" },
          ],
        }),
      );

      // The rows stop that far below the top of the list as they are scrolled into view
      expect(rowList().style.getPropertyValue("--bars-height")).toBe("48px");
    } finally {
      barsHeight.mockRestore();
    }
  });

  // @behavior ED-209
  it("marks the matches in rows as they are drawn", async () => {
    const highlights = stubHighlights();
    const layout = layOutSegmentList();
    try {
      await hold(longProject());
      segmentList.openSearch();
      flushSync();
      const patternBox = screen.getByRole<HTMLInputElement>("searchbox", {
        name: "搜尋文字",
      });
      patternBox.value = "段";
      patternBox.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();

      layout.scrollTo(8000);
      await settle();

      const markedRows = new Set(
        highlights
          .get("search-match")!
          .ranges.map((range) =>
            range.startContainer.parentElement
              ?.closest("li")
              ?.getAttribute("aria-posinset"),
          ),
      );
      expect(markedRows.has("101")).toBe(true);
    } finally {
      layout.restore();
      vi.unstubAllGlobals();
    }
  });

  // @behavior ED-210
  it("keeps the drawn heights of the other rows as a Segment is split", async () => {
    const observers = stubResizeObserver();
    const layout = layOutSegmentList();
    try {
      const project = longProject();
      await hold(project);
      scrollThroughAt40(layout, observers);

      const [first, ...rest] = project.segments;
      await hold(
        projectOf({
          segments: [
            { ...first, end_ms: 500, text: "第 0" },
            { ...first, start_ms: 500, text: "段" },
            ...rest,
          ],
        }),
      );

      const firstDrawn = drawnIndexes()[0];
      expect(spaceBeforeDrawn()).toBe(`${2 * 80 + (firstDrawn - 2) * 40}px`);
    } finally {
      layout.restore();
      vi.unstubAllGlobals();
    }
  });

  // @behavior ED-203
  it("tells each row's place among all the Segments", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
          { start_ms: 2000, end_ms: 3000, text: "很好" },
        ],
      }),
    );

    const second = segmentRows()[1];
    expect([
      second.getAttribute("aria-posinset"),
      second.getAttribute("aria-setsize"),
    ]).toEqual(["2", "3"]);
  });

  // @behavior ED-201
  it("redraws only the rows the Cursor moves between", async () => {
    await hold(
      projectOf({
        segments: [
          { start_ms: 0, end_ms: 1000, text: "大家" },
          { start_ms: 1000, end_ms: 2000, text: "今天" },
          { start_ms: 2000, end_ms: 3000, text: "很好" },
        ],
      }),
    );
    const enter = (row: HTMLElement) =>
      row
        .querySelector<HTMLElement>(".field.text")!
        .dispatchEvent(new FocusEvent("focus"));
    enter(segmentRows()[0]);
    await settle();
    const redraws: MutationRecord[] = [];
    const observer = new MutationObserver((records) =>
      redraws.push(...records),
    );
    observer.observe(rowList(), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    enter(segmentRows()[2]);
    await settle();
    redraws.push(...observer.takeRecords());
    observer.disconnect();

    const rows = segmentRows();
    // A node taken away is counted where it was taken from, not where it went
    const redrawnRows = new Set(
      redraws
        .filter((record) => record.target.isConnected)
        .map((record) => rows.findIndex((row) => row.contains(record.target))),
    );
    expect([...redrawnRows].sort()).toEqual([0, 2]);
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

    /** Whether the field `selector` names is held, and what it tells assistive technology. */
    const holdOf = (selector: string) => {
      const field = document.querySelector<HTMLElement>(selector)!;
      return [isFieldHeld(field), field.getAttribute("aria-disabled")];
    };
    expect([holdOf(".field.translation"), holdOf(".field.text")]).toEqual([
      [true, "true"],
      [false, "false"],
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
    openChangeMenu(segmentRows()[0]);

    expect(document.querySelector("li button.split kbd")?.textContent).toBe(
      "Ctrl+Alt+Enter",
    );
  });

  // @behavior ED-181
  it("shows the merge shortcuts beside merging in a Segment's menu", async () => {
    await hold(projectWithSecondText("今天"));
    segmentRows().forEach(openChangeMenu);

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
    openChangeMenu(segmentRows()[0]);

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
