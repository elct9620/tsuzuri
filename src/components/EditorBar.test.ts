// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed, type ProjectView } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { setInterfaceLanguage } from "#/i18n.ts";
import { projectOf, resourceOf } from "#/testing/project.ts";
import { pageContext } from "#/state/context.ts";
import EditorBar from "#/components/EditorBar.svelte";
import { PreviewFold } from "#/state/preview-fold.svelte.ts";
import { saveMark } from "#/state/save-mark.svelte.ts";
import { notifications, showNotifications } from "#/testing/notifications.ts";

describe("EditorBar", () => {
  let feed: ProjectFeed;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];
  /** The command that answers with a failure, if any. */
  let failingCommand: string | null;
  let unfollow: () => void;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;
  const translationChoice = () =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: "譯文" });

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

  /** Draws the bar with `next` as the Project open. */
  async function show(next: ProjectView): Promise<void> {
    project = next;
    render(EditorBar, {
      props: {
        openReplacement: () => {},
        openVersions: () => {},
        openSearch: () => {},
        openSpeakers: () => {},
        fold: new PreviewFold(),
      },
      context: pageContext(feed, new EditingSession(editingPort)),
    });
    await emit("project-changed");
    await settle();
  }

  async function chooseTranslation(language: string): Promise<void> {
    const choice = translationChoice();
    choice.value = language;
    choice.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  }

  beforeEach(async () => {
    await setInterfaceLanguage("zh-TW");
    project = null;
    calls = [];
    failingCommand = null;
    showNotifications();
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === failingCommand)
          return Promise.reject({ code: "io", detail: "denied" });
        if (command === "current_project") return project;
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

  // @behavior ED-187
  it("names the Current Resource above the editor", async () => {
    await show(translatedProject);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("ep01");
  });

  it("shows the Save Mark beside the Current Resource once an edit is saved", async () => {
    await show(translatedProject);

    saveMark.show();
    flushSync();

    const mark = screen.getByRole("status");
    expect([mark.textContent, mark.hasAttribute("data-is-shown")]).toEqual([
      "已存檔",
      true,
    ]);
  });

  // @behavior ED-188
  it("offers each translation of the Current Resource to show", async () => {
    await show(
      projectOf({
        resources: [resourceOf({ translation_languages: ["en"] })],
        shown_translation: "ja",
        running_mode: { mode: "translation", language: "ja", indexes: null },
      }),
    );

    const choice = translationChoice();
    expect([
      [...choice.options].map((option) => option.value),
      choice.value,
    ]).toEqual([["", "en", "ja"], "ja"]);
  });

  // @behavior ED-004
  it("shows the translation chosen for the Current Resource", async () => {
    await show(translatedProject);

    await chooseTranslation("ja");

    expect(sent("show_translation")).toEqual({ language: "ja" });
  });

  // @behavior TL-096
  it("says a translation was not shown when showing it is refused", async () => {
    await show(translatedProject);
    failingCommand = "show_translation";

    await chooseTranslation("ja");

    expect(notifications()).toEqual(["沒有顯示譯文"]);
  });

  // @behavior ED-093
  it("holds the choice of translation while a Mode runs", async () => {
    await show({
      ...translatedProject,
      running_mode: { mode: "translation", language: "en", indexes: null },
    });

    expect(translationChoice().disabled).toBe(true);
  });
});
