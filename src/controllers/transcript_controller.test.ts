// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectView } from "../project";
import TranscriptController from "./transcript_controller";

describe("TranscriptController", () => {
  let application: Application;
  let project: ProjectView | null;
  let calls: { command: string; args: unknown }[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function hold(next: ProjectView): Promise<void> {
    project = next;
    await emit("project-changed");
    await settle();
  }

  function fields(): string[] {
    return [
      ...document.querySelectorAll<HTMLTextAreaElement>("li textarea"),
    ].map((field) => field.value);
  }

  function edit(selector: string, value: string): void {
    const field = document.querySelector<HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event("change"));
  }

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  const translated: ProjectView = {
    media: null,
    language: "zh-TW",
    segments: [
      {
        start_ms: 0,
        end_ms: 1000,
        text: "大家好",
        translation: "Hello everyone",
      },
    ],
  };

  beforeEach(async () => {
    project = null;
    calls = [];
    document.body.innerHTML = `
      <section data-controller="transcript">
        <p data-transcript-target="empty">尚無內容</p>
        <details open>
          <summary>匯出</summary>
          <button id="save-original" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="original" disabled>原文</button>
          <button id="save-translation" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="translation" disabled>譯文</button>
          <button id="save-bilingual" data-transcript-target="export" data-action="transcript#save" data-transcript-content-param="bilingual" disabled>雙語</button>
        </details>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (command === "current_project") return project;
        if (command === "plugin:dialog|save") return "/subtitles/out.srt";
      },
      { shouldMockEvents: true },
    );
    application = Application.start();
    application.register("transcript", TranscriptController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-006
  it("lists each segment of the Project with its start and end time", async () => {
    await hold({
      media: "/media/lecture.mp4",
      language: "zh-TW",
      segments: [
        { start_ms: 0, end_ms: 1000, text: "大家好" },
        { start_ms: 62_003, end_ms: 64_500, text: "今天天氣很好" },
      ],
    });

    const times = [...document.querySelectorAll("li time")].map(
      (time) => time.textContent,
    );
    expect(times).toEqual([
      "00:00:00.000 → 00:00:01.000",
      "00:01:02.003 → 00:01:04.500",
    ]);
    expect(fields()).toEqual(["大家好", "今天天氣很好"]);
  });

  // @behavior TL-006
  it("shows each translation under its segment", async () => {
    await hold(translated);

    expect(fields()).toEqual(["大家好", "Hello everyone"]);
  });

  // @behavior ED-001
  it("writes an edited text to the Project", async () => {
    await hold({
      media: null,
      language: "zh-TW",
      segments: [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }],
    });

    edit("textarea.text", "逐字稿");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "text",
      value: "逐字稿",
    });
  });

  // @behavior ED-002
  it("writes an edited translation to the Project", async () => {
    await hold(translated);

    edit("textarea.translation", "Hi all");
    await settle();

    expect(sent("edit_segment")).toEqual({
      index: 0,
      field: "translation",
      value: "Hi all",
    });
  });

  // @behavior ED-003
  it("exports the Project as a bilingual SRT", async () => {
    await hold(translated);

    document.querySelector<HTMLButtonElement>("#save-bilingual")!.click();
    await settle();

    expect(sent("save_srt")).toEqual({
      path: "/subtitles/out.srt",
      content: "bilingual",
    });
  });
});
