// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble } from "../assembly";
import type { RecentProjectView } from "../backend/project";
import ProjectController from "./project-controller";
import RecentProjectsController from "./recent-projects-controller";

const LECTURE: RecentProjectView = {
  directory: "/videos/lecture",
  name: "lecture",
  opened_at_ms: Date.UTC(2026, 8, 24, 12),
};

describe("RecentProjectsController", () => {
  let application: Application;
  let recent: RecentProjectView[];
  let calls: { command: string; args: unknown }[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const list = () =>
    document.querySelector<HTMLUListElement>(
      "[data-recent-projects-target='list']",
    )!;
  const rows = () => [...list().querySelectorAll(".list-row")];

  async function showStartScreen(): Promise<void> {
    application = Application.start();
    await assemble(application, {
      project: ProjectController,
      "recent-projects": RecentProjectsController,
    }).start();
    await settle();
  }

  beforeEach(() => {
    recent = [LECTURE];
    calls = [];
    document.body.innerHTML = `
      <main data-controller="project recent-projects">
        <section data-project-target="startScreen">
          <ul data-recent-projects-target="list" hidden>
            <li data-recent-projects-target="heading">最近的專案</li>
          </ul>
        </section>
        <div data-project-target="workspace" hidden>
          <h1 data-project-target="name"></h1>
          <ul>
            <li id="open-directory">開啟目錄</li>
            <li data-recent-projects-target="menuTitle" hidden>最近的專案</li>
          </ul>
          <ul data-project-target="resources"></ul>
          <p data-project-target="glossary"></p>
        </div>
        <input type="radio" name="tabs" data-project-target="projectTab settings" />
        <input type="radio" name="tabs" data-project-target="generalTab" />
      </main>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return null;
        if (command === "recent_projects") return recent;
        if (command === "open_project") {
          recent = [];
          throw {
            code: "directory-not-found",
            directory: "/videos/lecture",
          };
        }
      },
      { shouldMockEvents: true },
    );
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior PJ-161
  it("lists each Recent Project with its name, path and the date it was opened", async () => {
    await showStartScreen();

    expect(list().hidden).toBe(false);
    expect(rows().map((row) => row.textContent)).toEqual([
      "lecture/videos/lecture2026年9月24日",
    ]);
  });

  // @behavior PJ-162
  it("opens the directory of the row clicked", async () => {
    await showStartScreen();

    rows()[0].querySelector("button")!.click();
    await settle();

    expect(calls.find((call) => call.command === "open_project")?.args).toEqual(
      { path: "/videos/lecture", language: "zh-TW" },
    );
  });

  // @behavior PJ-163
  it("hides the list and its heading while there are no Recent Projects", async () => {
    recent = [];

    await showStartScreen();

    expect(list().hidden).toBe(true);
  });

  // @behavior PJ-164
  it("lists each Recent Project in the Open menu with its path as the tooltip", async () => {
    await showStartScreen();

    await emit("project-changed");
    await settle();

    const items = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-recent-projects-target='menuItem'] button",
      ),
    ];
    expect(
      items.map((item) => [item.textContent, item.dataset.tooltip]),
    ).toEqual([["lecture", "/videos/lecture"]]);
  });

  // @behavior PJ-179
  it("lists a Recent Project by its Project Name on the start screen and in the Open menu", async () => {
    recent = [{ ...LECTURE, name: "週會錄影" }];
    await showStartScreen();

    await emit("project-changed");
    await settle();

    const names = [
      ...document.querySelectorAll(
        ".list-row .truncate:first-child, [data-recent-projects-target='menuItem'] span",
      ),
    ].map((name) => name.textContent);
    expect(names).toEqual(["週會錄影", "週會錄影"]);
  });

  // @behavior PJ-165
  it("reads the Recent Projects again once one could not be opened", async () => {
    await showStartScreen();

    rows()[0].querySelector("button")!.click();
    await settle();
    await settle();

    expect(rows()).toEqual([]);
    expect(list().hidden).toBe(true);
  });
});
