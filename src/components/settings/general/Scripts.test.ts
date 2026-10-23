// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ScannedScript } from "#/ipc/scripts.ts";
import Scripts from "#/components/settings/general/Scripts.svelte";
import { settle } from "#/testing/settle.ts";

describe("Scripts", () => {
  let calls: { command: string; args: unknown }[];

  const scripts: ScannedScript[] = [
    {
      name: "interview.rb",
      registrations: [
        { kind: "macro", id: "merge_runs", label: "合併連續發言" },
        { kind: "export-format", id: "tsv", label: "TSV", extension: "tsv" },
      ],
      failure: null,
    },
    {
      name: "broken.rb",
      registrations: [],
      failure: {
        kind: "unsupported-api-version",
        declared: { major: 2, minor: 0 },
      },
    },
  ];

  const argsOf = (command: string) =>
    calls.filter((call) => call.command === command).map((call) => call.args);
  const rows = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent!.trim()),
      );

  async function openSection(): Promise<void> {
    render(Scripts);
    await settle();
  }

  beforeEach(() => {
    calls = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "scan_scripts") return scripts;
      if (command === "open_scripts_directory") return null;
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior SR-037
  it("lists each Script with what it registers, or why it does not load", async () => {
    await openSection();

    expect(rows()).toEqual([
      ["interview.rb", "1 個巨集、1 個匯出格式"],
      ["broken.rb", "腳本是為 tsuzuri-api 2.0 寫的，這個版本的 Tsuzuri 不支援"],
    ]);
  });

  it("marks a Script that does not load in red", async () => {
    await openSection();

    expect(screen.getByText(/tsuzuri-api 2.0/).classList).toContain(
      "text-error",
    );
  });

  // @behavior SR-038
  it("scans every Script again when asked", async () => {
    await openSection();

    screen.getByRole("button", { name: "重新掃描" }).click();
    await settle();

    expect(argsOf("scan_scripts")).toEqual([
      { isForced: false },
      { isForced: true },
    ]);
  });

  it("opens the Scripts folder", async () => {
    await openSection();

    screen.getByRole("button", { name: "開啟資料夾" }).click();
    await settle();

    expect(argsOf("open_scripts_directory")).toHaveLength(1);
  });
});
