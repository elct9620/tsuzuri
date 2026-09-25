// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOTIFICATION_STACK, notifications } from "../test_notification";
import VersionsController, { localTime } from "./versions_controller";

describe("VersionsController", () => {
  let application: Application;
  let restored: unknown;

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
              },
            ],
          },
          {
            language: "en",
            backups: [
              {
                file: "ep01.en.20260925T030000Z.srt",
                taken_at: "20260925T030000Z",
              },
            ],
          },
        ];
      if (command === "compare_versions")
        return [
          {
            start_ms: 0,
            end_ms: 1000,
            left: "你好",
            right: "您好",
            is_changed: true,
          },
          {
            start_ms: 1000,
            end_ms: 2000,
            left: "世界",
            right: "世界",
            is_changed: false,
          },
        ];
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
});
