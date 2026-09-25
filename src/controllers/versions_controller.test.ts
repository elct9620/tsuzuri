// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";
import { localTime } from "../ui/time";
import type { ComparedRow } from "../backend/project";
import VersionsController from "./versions_controller";

describe("VersionsController", () => {
  let application: Application;
  let restored: unknown;
  let reverted: unknown;
  let rows: ComparedRow[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-versions-target="${name}"]`)!;

  async function openVersions(): Promise<void> {
    document.querySelector<HTMLButtonElement>("#open")!.click();
    await settle();
  }

  async function chooseSubtitle(language: string): Promise<void> {
    target<HTMLSelectElement>("subtitle").value = language;
    target<HTMLSelectElement>("subtitle").dispatchEvent(new Event("change"));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    target("backups").querySelector<HTMLButtonElement>(selector)!.click();
    await settle();
  }

  beforeEach(async () => {
    restored = undefined;
    reverted = undefined;
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
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <div data-controller="versions">
        <button id="open" data-action="versions#open">版本</button>
        <dialog data-versions-target="dialog">
          <select data-versions-target="subtitle" data-action="change->versions#showBackups"></select>
          <ul data-versions-target="backups"></ul>
          <section data-versions-target="comparison" hidden>
            <select data-versions-target="left"></select>
            <select data-versions-target="right"></select>
            <input type="checkbox" data-versions-target="onlyDifferences"
              data-action="change->versions#showOnlyDifferences">
            <button id="next" data-action="versions#moveToNextDifference">↓</button>
            <table><tbody data-versions-target="rows"></tbody></table>
          </section>
        </dialog>
      </div>
    `;
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
      if (command === "compare_versions") return rows;
      if (command === "revert_row") reverted = args;
      if (command === "restore_version") restored = args;
    });
    application = Application.start();
    application.register("versions", VersionsController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior VR-007
  it("lists the Backups of the original by their local time", async () => {
    await openVersions();

    const listed = [...target("backups").querySelectorAll("li")].map(
      (li) => li.textContent,
    );
    expect(listed[1]).toContain(localTime("20260925T023000Z"));
  });

  // @behavior VR-008
  it("marks the rows that differ once a Backup is compared", async () => {
    await openVersions();

    await click("button.compare");

    expect([
      target("comparison").hidden,
      [...target("rows").querySelectorAll("tr")].map((tr) =>
        tr.classList.contains("changed"),
      ),
    ]).toEqual([false, [true, false]]);
  });

  // @behavior VR-009
  it("asks to restore a Backup of the translation shown", async () => {
    await openVersions();
    await chooseSubtitle("en");

    await click("button.restore");

    expect([restored, notifications()]).toEqual([
      { language: "en", backup: "ep01.en.20260925T030000Z.srt" },
      ["已還原"],
    ]);
  });
  const shownRows = () =>
    [...target("rows").querySelectorAll("tr")].filter((tr) => !tr.hidden);

  // @behavior VR-032
  it("says which kind each Backup is", async () => {
    await openVersions();

    const kinds = [...target("backups").querySelectorAll(".kind")].map(
      (label) => label.textContent,
    );
    expect(kinds).toEqual(["覆蓋前", "產出"]);
  });

  // @behavior VR-033
  it("shows only the rows that differ", async () => {
    await openVersions();
    await click("button.compare");
    const onlyDifferences = target<HTMLInputElement>("onlyDifferences");

    onlyDifferences.checked = true;
    onlyDifferences.dispatchEvent(new Event("change"));

    expect(shownRows().map((tr) => tr.textContent)).toEqual([
      expect.stringContaining("您好"),
    ]);
  });

  // @behavior VR-034
  it("moves to the next difference", async () => {
    rows.reverse();
    await openVersions();
    await click("button.compare");

    document.querySelector<HTMLButtonElement>("#next")!.click();

    const current = [...target("rows").querySelectorAll("tr")].findIndex((tr) =>
      tr.hasAttribute("data-current"),
    );
    expect(current).toBe(1);
  });

  // @behavior VR-035
  it("takes back a row from the Versions dialog", async () => {
    await openVersions();
    await click("button.compare");

    target("rows").querySelector<HTMLButtonElement>("button.revert")!.click();
    await settle();

    expect(reverted).toEqual({
      language: null,
      backup: "ep01.20260925T023000Z.srt",
      row: 0,
      part: "whole",
    });
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
    await openVersions();
    await click("button.compare");

    const added = [
      ...target("rows")
        .querySelectorAll("tr")[0]
        .querySelectorAll("td")[2]
        .querySelectorAll("[data-span=addition]"),
    ].map((span) => span.textContent);
    expect(added).toEqual(["會"]);
  });
});
