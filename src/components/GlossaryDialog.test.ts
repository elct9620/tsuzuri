// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GlossaryTable } from "#/backend/project.ts";
import GlossaryDialog from "#/components/GlossaryDialog.svelte";

describe("GlossaryDialog", () => {
  let table: GlossaryTable | Promise<never>;
  let savedArgs: unknown;
  let isSavingRefused: boolean;
  let dialog: { open(): Promise<void> };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const glossary = () => screen.getByRole("dialog", { hidden: true });
  /** Each row of terms, below the row naming the Languages. */
  const termRows = () =>
    within(glossary()).getAllByRole("row", { hidden: true }).slice(1);
  /** The alert saying why the glossary could not be read or saved, or null while none is shown. */
  const failure = () =>
    within(glossary())
      .queryAllByRole("alert", { hidden: true })
      .find((alert) => alert.classList.contains("alert-error")) ?? null;
  const saveButton = () =>
    within(glossary()).getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: "儲存",
    });

  function tableOf(changes: Partial<GlossaryTable> = {}): GlossaryTable {
    return {
      languages: ["zh-TW", "en", "ja"],
      rows: [{ words: ["蝙蝠俠", "Batman", ""], is_speaker: false }],
      has_source_target_header: false,
      ...changes,
    };
  }

  function fields(): string[][] {
    return termRows().map((row) =>
      within(row)
        .getAllByRole<HTMLInputElement>("textbox", { hidden: true })
        .map((input) => input.value),
    );
  }

  function speakerChoices(): boolean[] {
    return termRows().map(
      (row) =>
        within(row).getByRole<HTMLInputElement>("checkbox", { hidden: true })
          .checked,
    );
  }

  async function save(): Promise<void> {
    saveButton().click();
    await settle();
  }

  async function openDialog(): Promise<void> {
    await dialog.open();
    await settle();
  }

  beforeEach(() => {
    table = tableOf();
    savedArgs = undefined;
    isSavingRefused = false;
    mockIPC((command, args) => {
      if (command === "translation_glossary_table") return table;
      if (command === "save_translation_glossary") {
        if (isSavingRefused)
          return Promise.reject({ code: "io", detail: "denied" });
        savedArgs = args;
      }
    });
    dialog = render(GlossaryDialog).component;
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior GL-007
  it("lays out each Language as a column and each term as a row of fields", async () => {
    await openDialog();

    const languages = within(glossary())
      .getAllByRole("columnheader", { hidden: true })
      .map((cell) => cell.textContent);
    expect([languages.slice(0, 4), fields(), speakerChoices()]).toEqual([
      ["繁體中文", "English", "日本語", "說話者"],
      [["蝙蝠俠", "Batman", ""]],
      [false],
    ]);
  });

  // @behavior GL-008
  it("sends the rows of the dialog to be saved", async () => {
    await openDialog();
    within(glossary())
      .getByRole("button", { hidden: true, name: "新增一列" })
      .click();
    await settle();
    const [, addedRow] = termRows();
    const newRowInputs = within(addedRow).getAllByRole<HTMLInputElement>(
      "textbox",
      { hidden: true },
    );
    for (const [input, word] of [
      [newRowInputs[0], "阿福"],
      [newRowInputs[1], "Alfred"],
    ] as const) {
      input.value = word;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await save();

    expect(savedArgs).toEqual({
      rows: [
        { words: ["蝙蝠俠", "Batman", ""], is_speaker: false },
        { words: ["阿福", "Alfred", ""], is_speaker: false },
      ],
    });
  });

  // @behavior GL-009
  it("warns a source,target header will be written as Language codes", async () => {
    table = tableOf({ has_source_target_header: true });

    await openDialog();

    expect(
      within(glossary())
        .getByText("目前的標頭是 source,target，儲存後改用語言代碼")
        .closest("[role=alert]"),
    ).not.toBeNull();
  });

  // @behavior GL-010
  it("keeps an unreadable glossary from being saved over", async () => {
    table = Promise.reject({ code: "glossary-without-header" });

    await openDialog();

    expect([failure() !== null, saveButton().disabled]).toEqual([true, true]);
  });

  // @behavior GL-015
  it("sends a row marked as naming a Speaker", async () => {
    table = tableOf({
      rows: [{ words: ["小明", "Xiao Ming", ""], is_speaker: false }],
    });
    await openDialog();
    within(termRows()[0])
      .getByRole("checkbox", { hidden: true, name: "說話者" })
      .click();

    await save();

    expect(savedArgs).toEqual({
      rows: [{ words: ["小明", "Xiao Ming", ""], is_speaker: true }],
    });
  });

  // @behavior GL-017
  it("leaves a removed row out of what is saved", async () => {
    table = tableOf({
      rows: [
        { words: ["蝙蝠俠", "Batman", ""], is_speaker: false },
        { words: ["阿福", "Alfred", ""], is_speaker: false },
      ],
    });
    await openDialog();
    within(termRows()[0])
      .getByRole("button", { hidden: true, name: "刪除這一列" })
      .click();
    await settle();

    await save();

    expect(savedArgs).toEqual({
      rows: [{ words: ["阿福", "Alfred", ""], is_speaker: false }],
    });
  });

  // @behavior GL-018
  it("closes the dialog once saved", async () => {
    await openDialog();

    await save();

    expect((glossary() as HTMLDialogElement).open).toBe(false);
  });

  // @behavior GL-019
  it("keeps the rows open and says why when saving fails", async () => {
    isSavingRefused = true;
    await openDialog();

    await save();

    expect([
      (glossary() as HTMLDialogElement).open,
      fields(),
      failure() !== null,
    ]).toEqual([true, [["蝙蝠俠", "Batman", ""]], true]);
  });

  // @behavior GL-020
  it("says nothing failed when the glossary is readable on opening again", async () => {
    table = Promise.reject({ code: "glossary-without-header" });
    await openDialog();
    (glossary() as HTMLDialogElement).close();
    table = tableOf();

    await openDialog();

    expect([failure(), saveButton().disabled]).toEqual([null, false]);
  });
});
