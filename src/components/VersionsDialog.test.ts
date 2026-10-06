// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editingPort } from "#/ipc/editing.ts";
import { type ComparedRow, ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { setInterfaceLanguage, t } from "#/i18n.ts";
import { pageContext } from "#/state/context.ts";
import { EditorComparison } from "#/state/editor-comparison.svelte.ts";
import { notifications, showNotifications } from "#/testing/notifications.ts";
import VersionsDialog from "#/components/VersionsDialog.svelte";

describe("VersionsDialog", () => {
  let versionsDialog: VersionsDialog;
  let comparison: EditorComparison;
  let restoreArgs: unknown;
  let revertArgs: unknown;
  let rows: ComparedRow[];
  /** How `compare_versions` answers; the rows at once unless a test holds them back. */
  let takeRows: () => ComparedRow[] | Promise<ComparedRow[]>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  const buttons = (name: string) =>
    screen.getAllByRole("button", { hidden: true, name });
  /** The rows of the comparison shown. */
  const comparedRows = () =>
    within(
      screen.getByRole("table", { hidden: true }),
    ).queryAllByRole<HTMLTableRowElement>("row", { hidden: true });

  async function chooseSubtitle(language: string): Promise<void> {
    const subtitle = screen.getByRole<HTMLSelectElement>("combobox", {
      hidden: true,
      name: t("versions.subtitle"),
    });
    subtitle.value = language;
    subtitle.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  async function click(button: HTMLElement): Promise<void> {
    button.click();
    await settle();
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    restoreArgs = undefined;
    revertArgs = undefined;
    takeRows = () => rows;
    rows = [
      {
        kind: "pair",
        left: [{ start_ms: 0, end_ms: 1000, text: "你好" }],
        right: [{ start_ms: 0, end_ms: 1000, text: "您好" }],
        is_text_changed: true,
        is_time_changed: false,
        text_spans: [],
      },
      {
        kind: "pair",
        left: [{ start_ms: 1000, end_ms: 2000, text: "世界" }],
        right: [{ start_ms: 1000, end_ms: 2000, text: "世界" }],
        is_text_changed: false,
        is_time_changed: false,
        text_spans: [],
      },
    ];
    showNotifications();
    mockIPC((command, args) => {
      if (command === "subtitle_versions")
        return [
          {
            language: null,
            backups: [
              {
                file: "ep01.20260925T023000Z.srt",
                taken_at: "20260925T023000Z",
                kind: "overwrite",
              },
              {
                file: "ep01.20260925T020000Z.output.srt",
                taken_at: "20260925T020000Z",
                kind: "output",
              },
            ],
          },
          {
            language: "en",
            backups: [
              {
                file: "ep01.en.20260925T030000Z.srt",
                taken_at: "20260925T030000Z",
                kind: "overwrite",
              },
            ],
          },
        ];
      if (command === "compare_versions") return takeRows();
      if (command === "revert_row") {
        revertArgs = args;
        return { unmatched_count: 0 };
      }
      if (command === "restore_version") {
        restoreArgs = args;
        return { unmatched_count: 0 };
      }
    });
    comparison = new EditorComparison();
    versionsDialog = render(VersionsDialog, {
      context: pageContext(
        new ProjectFeed(),
        new EditingSession(editingPort),
        undefined,
        undefined,
        comparison,
      ),
    }).component;
    await versionsDialog.open();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior VR-043
  it("hands the editor a Backup set as the comparison, and closes", async () => {
    const compareWith = vi.spyOn(comparison, "compareWith");
    await chooseSubtitle("en");

    await click(buttons(t("versions.setComparison"))[0]);

    expect([compareWith.mock.calls, dialog().open]).toEqual([
      [["en", "ep01.en.20260925T030000Z.srt"]],
      false,
    ]);
  });

  // @behavior VR-007
  it("lists the Backups of the original by their local time", () => {
    const backupTexts = within(dialog())
      .getAllByRole("listitem", { hidden: true })
      .map((item) => item.textContent);

    expect(backupTexts[1]).toContain("2026-09-25 10:30");
  });

  // @behavior VR-008
  it("marks the rows that differ once a Backup is compared", async () => {
    await click(buttons(t("versions.compare"))[0]);

    expect(
      comparedRows().map((row) => row.hasAttribute("data-is-different")),
    ).toEqual([true, false]);
  });

  // @behavior VR-055
  it("shows the comparison of the Backup chosen last", async () => {
    let answerEarlier: (rows: ComparedRow[]) => void = () => {};
    takeRows = () =>
      new Promise((resolve) => {
        answerEarlier = resolve;
      });
    await click(buttons(t("versions.compare"))[0]);
    takeRows = () => rows;
    await click(buttons(t("versions.compare"))[1]);

    answerEarlier([rows[1]]);
    await settle();

    expect(
      comparedRows().map((row) => row.hasAttribute("data-is-different")),
    ).toEqual([true, false]);
  });

  // @behavior VR-009
  it("asks to restore a Backup of the translation shown", async () => {
    await chooseSubtitle("en");

    await click(buttons(t("versions.restore"))[0]);

    expect([restoreArgs, notifications()]).toEqual([
      { language: "en", backup: "ep01.en.20260925T030000Z.srt" },
      ["已還原"],
    ]);
  });

  // @behavior VR-032
  it("says which kind each Backup is", () => {
    const kinds = within(dialog())
      .getAllByRole("listitem", { hidden: true })
      .slice(1)
      .map((item) => item.querySelector(".badge")?.textContent);

    expect(kinds).toEqual(["覆蓋前", "產出"]);
  });

  // @behavior VR-033
  it("shows only the rows that differ", async () => {
    await click(buttons(t("versions.compare"))[0]);

    await click(
      screen.getByRole("checkbox", {
        hidden: true,
        name: t("versions.onlyDifferences"),
      }),
    );

    expect(comparedRows().map((row) => row.textContent)).toEqual([
      expect.stringContaining("您好"),
    ]);
  });

  // @behavior VR-034
  it("moves to the next difference", async () => {
    rows.reverse();
    await click(buttons(t("versions.compare"))[0]);

    await click(buttons(t("versions.nextDifference"))[0]);

    expect(
      comparedRows().findIndex((row) => row.hasAttribute("data-is-current")),
    ).toBe(1);
  });

  // @behavior VR-035
  it("takes back a row from the Versions dialog", async () => {
    await click(buttons(t("versions.compare"))[0]);

    await click(buttons(t("compare.revertWhole"))[0]);

    expect([revertArgs, notifications()]).toEqual([
      {
        language: null,
        backup: "ep01.20260925T023000Z.srt",
        row: 0,
        part: "whole",
      },
      ["已還原"],
    ]);
  });

  // @behavior VR-036
  it("shows the characters that changed", async () => {
    rows[0] = {
      ...rows[0],
      left: [{ start_ms: 0, end_ms: 1000, text: "資料不上傳" }],
      right: [{ start_ms: 0, end_ms: 1000, text: "資料不會上傳" }],
      text_spans: [
        { kind: "common", text: "資料不" },
        { kind: "addition", text: "會" },
        { kind: "common", text: "上傳" },
      ],
    };

    await click(buttons(t("versions.compare"))[0]);

    const additions = [
      ...comparedRows()[0]
        .querySelectorAll("td")[2]
        .querySelectorAll("[data-span=addition]"),
    ].map((span) => span.textContent);
    expect(additions).toEqual(["會"]);
  });
});
