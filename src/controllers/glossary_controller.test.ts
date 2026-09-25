// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GlossaryController, { type GlossaryTable } from "./glossary_controller";

describe("GlossaryController", () => {
  let application: Application;
  let table: GlossaryTable | Promise<never>;
  let savedArgs: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-glossary-target="${name}"]`)!;

  function tableOf(changes: Partial<GlossaryTable> = {}): GlossaryTable {
    return {
      languages: ["zh-TW", "en", "ja"],
      rows: [["蝙蝠俠", "Batman", ""]],
      has_source_target_header: false,
      ...changes,
    };
  }

  function fields(): string[][] {
    return [...target("rows").querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll("input")].map((input) => input.value),
    );
  }

  async function openDialog(): Promise<void> {
    target("open").click();
    await settle();
  }

  beforeEach(async () => {
    table = tableOf();
    savedArgs = undefined;
    document.body.innerHTML = `
      <div data-controller="glossary">
        <button data-glossary-target="open" data-action="glossary#open">詞彙表</button>
        <dialog data-glossary-target="dialog">
          <div data-glossary-target="warning" hidden>儲存後改用語言代碼標頭</div>
          <p data-glossary-target="failure" hidden></p>
          <table>
            <thead><tr data-glossary-target="languages"></tr></thead>
            <tbody data-glossary-target="rows"></tbody>
          </table>
          <button id="add" data-action="glossary#addRow">新增一列</button>
          <button id="save" data-glossary-target="save" data-action="glossary#save">儲存</button>
        </dialog>
      </div>
    `;
    mockIPC((command, args) => {
      if (command === "translation_glossary_table") return table;
      if (command === "save_translation_glossary") savedArgs = args;
    });
    application = Application.start();
    application.register("glossary", GlossaryController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior GL-007
  it("lays out each Language as a column and each term as a row of fields", async () => {
    await openDialog();

    const languages = [...target("languages").querySelectorAll("th")].map(
      (cell) => cell.textContent,
    );
    expect([languages.slice(0, 3), fields()]).toEqual([
      ["繁體中文", "English", "日本語"],
      [["蝙蝠俠", "Batman", ""]],
    ]);
  });

  // @behavior GL-008
  it("sends the rows of the dialog to be saved", async () => {
    await openDialog();
    document.querySelector<HTMLButtonElement>("#add")!.click();
    const added = target("rows").querySelectorAll<HTMLInputElement>(
      "tr:last-child input",
    );
    added[0].value = "阿福";
    added[1].value = "Alfred";

    document.querySelector<HTMLButtonElement>("#save")!.click();
    await settle();

    expect(savedArgs).toEqual({
      rows: [
        ["蝙蝠俠", "Batman", ""],
        ["阿福", "Alfred", ""],
      ],
    });
  });

  // @behavior GL-009
  it("warns a source,target header will be written as Language codes", async () => {
    table = tableOf({ has_source_target_header: true });

    await openDialog();

    expect(target("warning").hidden).toBe(false);
  });

  // @behavior GL-010
  it("keeps an unreadable glossary from being saved over", async () => {
    table = Promise.reject({ code: "glossary-without-header" });

    await openDialog();

    expect([
      target("failure").hidden,
      target<HTMLButtonElement>("save").disabled,
    ]).toEqual([false, true]);
  });
});
