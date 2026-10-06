// @vitest-environment happy-dom
import { screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/backend/editing.ts";
import { ProjectFeed, type ProjectView } from "#/backend/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { projectOf, resourceOf } from "#/test-project.ts";
import {
  showNotifications,
  notificationItems,
  notifications,
} from "#/components/test-notifications.ts";
import { pageContext } from "#/components/context.ts";
import DiarizationDialog from "#/components/DiarizationDialog.svelte";
import { renderWithToolbar } from "#/components/test-toolbar.ts";
import { TaskRun } from "#/components/task-run.svelte.ts";

describe("DiarizationDialog", () => {
  let feed: ProjectFeed;
  let run: TaskRun;
  let commandsSent: string[];
  let project: ProjectView | null;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const openButton = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "辨識" });
  const startButton = () =>
    screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: /開始/,
    });
  const warning = () => screen.queryByRole("alert", { hidden: true });

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await feed.refresh();
    await settle();
  }

  async function openDialog(): Promise<void> {
    openButton().click();
    await settle();
  }

  const resourceWithMedia = projectOf({
    resources: [resourceOf({ has_media: true })],
  });
  const segment = (speaker: string | null) => ({
    start_ms: 0,
    end_ms: 1000,
    text: "大家好",
    ...(speaker === null ? {} : { speaker }),
  });

  beforeEach(() => {
    project = null;
    commandsSent = [];
    showNotifications();
    mockIPC((command) => {
      commandsSent.push(command);
      if (command === "current_project") return project;
      if (command === "model_settings")
        return {
          diarization: {
            source: {
              kind: "file",
              path: "/models/Nemotron-3-Diarization.q8_0.gguf",
            },
          },
        };
      if (command === "diarize")
        return {
          audio_seconds: 60,
          diarize_seconds: 4,
          phases: [
            { phase: "prepare", seconds: 0.01 },
            { phase: "convert", seconds: 0.3 },
            { phase: "load", seconds: 0.5 },
            { phase: "diarize", seconds: 3.2 },
          ],
        };
    });
    feed = new ProjectFeed();
    run = new TaskRun();
    renderWithToolbar(
      DiarizationDialog,
      "openDiarization",
      pageContext(feed, new EditingSession(editingPort), run),
    );
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior DZ-015
  it("diarizes the Current Resource from the toolbar", async () => {
    await hold(resourceWithMedia);
    await openDialog();

    startButton().click();
    await settle();

    expect([
      commandsSent.includes("diarize"),
      notifications(),
      notificationItems(0)[0],
    ]).toEqual([true, ["說話者辨識完成"], ["音檔長度", "60.0 秒"]]);
  });

  // @behavior DZ-022
  it("lists the real-time factor of a diarization", async () => {
    await hold(resourceWithMedia);
    await openDialog();

    startButton().click();
    await settle();

    expect(notificationItems(0)).toContainEqual(["即時倍率（RTF）", "0.07"]);
  });

  // @behavior DZ-024
  it("starts no diarization while another task runs", async () => {
    await hold(resourceWithMedia);
    run.begin("transcription");
    await openDialog();

    startButton().click();
    await settle();

    expect(commandsSent).not.toContain("diarize");
  });

  // @behavior DZ-016
  it("offers a diarization only with a media file and a subtitle", async () => {
    await hold(
      projectOf({
        resources: [resourceOf({ has_media: true, has_subtitle: false })],
      }),
    );
    const isWithoutSubtitleDisabled = openButton().disabled;

    await hold(resourceWithMedia);

    expect([isWithoutSubtitleDisabled, openButton().disabled]).toEqual([
      true,
      false,
    ]);
  });

  // @behavior DZ-017
  it("warns that a diarization replaces the Speakers given", async () => {
    await hold({ ...resourceWithMedia, segments: [segment("co")] });

    await openDialog();

    expect([warning() !== null, startButton().textContent]).toEqual([
      true,
      "覆蓋並開始",
    ]);
  });

  it("starts without a warning when no Segment carries a Speaker", async () => {
    await hold({ ...resourceWithMedia, segments: [segment(null)] });

    await openDialog();

    expect([warning(), startButton().textContent]).toEqual([null, "開始辨識"]);
  });

  it("names the diarization Model it runs with", async () => {
    await hold(resourceWithMedia);

    await openDialog();

    expect(
      screen.getByText("Nemotron-3-Diarization.q8_0.gguf", {
        selector: "span",
      }),
    ).not.toBeNull();
  });
});
