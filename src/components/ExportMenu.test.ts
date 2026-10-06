// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/backend/editing.ts";
import { ProjectFeed, type ProjectView } from "#/backend/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { projectOf, resourceOf } from "#/test-project.ts";
import { pageContext } from "#/components/context.ts";
import ExportMenu from "#/components/ExportMenu.svelte";
import {
  notifications,
  showNotifications,
} from "#/components/test-notifications.ts";

describe("ExportMenu", () => {
  let feed: ProjectFeed;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;
  let unfollow: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const exportButton = (name: string) =>
    screen.getByRole<HTMLButtonElement>("button", { hidden: true, name });
  const textToggle = (name: string) =>
    screen.getByRole<HTMLInputElement>("checkbox", { hidden: true, name });

  const translatedProject: ProjectView = projectOf({
    resources: [resourceOf({ translation_languages: ["en"] })],
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

  /** Draws the menu with `next` as the Project open. */
  async function show(next: ProjectView | null): Promise<void> {
    project = next;
    render(ExportMenu, {
      context: pageContext(feed, new EditingSession(editingPort)),
    });
    await emit("project-changed");
    await settle();
  }

  async function choose(name: string): Promise<void> {
    exportButton(name).click();
    await settle();
  }

  function turnOff(name: string): void {
    const choice = textToggle(name);
    choice.checked = false;
    choice.dispatchEvent(new Event("change", { bubbles: true }));
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
    calls = [];
    failingCommand = null;
    localStorage.clear();
    showNotifications();
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === failingCommand)
          return Promise.reject({ code: "io", detail: "denied" });
        if (command === "current_project") return project;
        if (command === "export_path")
          return (args as { format: string }).format === "plain_text"
            ? "/talks/lecture.en.txt"
            : "/talks/lecture.en.srt";
        if (command === "plugin:dialog|save") return "/subtitles/out.srt";
      },
      { shouldMockEvents: true },
    );
    feed = new ProjectFeed();
    unfollow = await feed.start();
  });

  afterEach(() => {
    unfollow();
    clearMocks();
  });

  // @behavior ED-003
  it("exports the Project as a bilingual SRT", async () => {
    await show(translatedProject);

    await choose("雙語 SRT");

    expect(sent("save_srt")).toEqual({
      path: "/subtitles/out.srt",
      content: "bilingual",
    });
  });

  // @behavior PJ-014
  it("opens the save dialog at the default path of the export", async () => {
    await show(translatedProject);

    await choose("另存譯文");

    expect(sent("export_path")).toEqual({
      content: "translation",
      format: "srt",
    });
    expect(sent("plugin:dialog|save")).toMatchObject({
      options: { defaultPath: "/talks/lecture.en.srt" },
    });
  });

  // @behavior ED-155
  it("exports the translation as Plain Text with its Speakers and blank lines", async () => {
    await show(translatedProject);

    await choose("譯文純文字");

    expect([sent("plugin:dialog|save"), sent("save_text")]).toMatchObject([
      {
        options: {
          defaultPath: "/talks/lecture.en.txt",
          filters: [{ extensions: ["txt"] }],
        },
      },
      {
        path: "/subtitles/out.srt",
        content: "translation",
        hasSpeakers: true,
        hasBlankLines: true,
      },
    ]);
  });

  // @behavior ED-156
  it("exports Plain Text without its Speakers once they are turned off", async () => {
    await show(translatedProject);
    turnOff("純文字含說話者");

    await choose("譯文純文字");

    expect(sent("save_text")).toMatchObject({ hasSpeakers: false });
  });

  // @behavior ED-157
  it("keeps the Speakers turned off for Plain Text the next time the app opens", async () => {
    await show(translatedProject);
    turnOff("純文字含說話者");
    cleanup();

    await show(translatedProject);

    expect(textToggle("純文字含說話者").checked).toBe(false);
  });

  // @behavior ED-162
  it("exports Plain Text without blank lines once they are turned off", async () => {
    await show(translatedProject);
    turnOff("段落之間加入空行");

    await choose("譯文純文字");

    expect(sent("save_text")).toMatchObject({ hasBlankLines: false });
  });

  // @behavior ED-163
  it("keeps the blank lines turned off for Plain Text the next time the app opens", async () => {
    await show(translatedProject);
    turnOff("段落之間加入空行");
    cleanup();

    await show(translatedProject);

    expect(textToggle("段落之間加入空行").checked).toBe(false);
  });

  // @behavior ED-185
  it("offers no export for a Project without Segments", async () => {
    await show(projectOf({ segments: [] }));

    expect(
      screen
        .getAllByRole<HTMLButtonElement>("button", { hidden: true })
        .filter((button) => button.closest("ul") !== null)
        .every((button) => button.disabled),
    ).toBe(true);
  });

  // @behavior ED-186
  it("offers only the original's exports before a translation", async () => {
    await show(
      projectOf({ segments: [{ start_ms: 0, end_ms: 1000, text: "大家好" }] }),
    );

    const offered = screen
      .getAllByRole<HTMLButtonElement>("button", { hidden: true })
      .filter((button) => button.closest("ul") !== null && !button.disabled)
      .map((button) => button.textContent);
    expect(offered).toEqual(["另存原文", "原文純文字"]);
  });

  // @behavior PJ-149
  it("says an export was not written when writing it fails", async () => {
    await show(translatedProject);
    failingCommand = "save_srt";

    await choose("另存原文");

    expect(notifications()).toEqual(["沒有匯出"]);
  });
});
