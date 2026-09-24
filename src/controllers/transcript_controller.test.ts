// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscriptController from "./transcript_controller";

describe("TranscriptController", () => {
  let application: Application;
  let saved: unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function load(event: string, segments: unknown[]): void {
    window.dispatchEvent(new CustomEvent(event, { detail: { segments } }));
  }

  function fields(): string[] {
    return [
      ...document.querySelectorAll<HTMLTextAreaElement>("li textarea"),
    ].map((field) => field.value);
  }

  beforeEach(async () => {
    saved = undefined;
    document.body.innerHTML = `
      <section data-controller="transcript" data-action="transcribe:loaded@window->transcript#show translate:loaded@window->transcript#show">
        <p data-transcript-target="empty">尚無內容</p>
        <div data-transcript-target="actions" hidden>
          <button id="save-original" data-action="transcript#saveOriginal">另存原文</button>
          <button id="save-translation" data-transcript-target="saveTranslation" data-action="transcript#saveTranslation" hidden>另存譯文</button>
        </div>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    mockIPC((command, args) => {
      if (command === "plugin:dialog|save") return "/subtitles/out.srt";
      if (command === "save_srt") saved = args;
    });
    application = Application.start();
    application.register("transcript", TranscriptController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior TX-006
  it("lists each segment with its start and end time", () => {
    load("transcribe:loaded", [
      { start_ms: 0, end_ms: 1000, text: "大家好" },
      { start_ms: 62_003, end_ms: 64_500, text: "今天天氣很好" },
    ]);

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
  it("shows each translation under its segment", () => {
    load("translate:loaded", [
      {
        start_ms: 0,
        end_ms: 1000,
        text: "大家好",
        translation: "Hello everyone",
      },
    ]);

    expect(fields()).toEqual(["大家好", "Hello everyone"]);
  });

  // @behavior ED-001
  it("saves the edited text of a segment", async () => {
    load("transcribe:loaded", [{ start_ms: 0, end_ms: 1000, text: "竹子搞" }]);
    document.querySelector<HTMLTextAreaElement>("textarea.text")!.value =
      "逐字稿";

    document.querySelector<HTMLButtonElement>("#save-original")!.click();
    await settle();

    expect(saved).toEqual({
      path: "/subtitles/out.srt",
      segments: [{ start_ms: 0, end_ms: 1000, text: "逐字稿" }],
    });
  });

  // @behavior ED-002
  it("saves the translations in place of the original text", async () => {
    load("translate:loaded", [
      {
        start_ms: 0,
        end_ms: 1000,
        text: "大家好",
        translation: "Hello everyone",
      },
    ]);

    document.querySelector<HTMLButtonElement>("#save-translation")!.click();
    await settle();

    expect(saved).toEqual({
      path: "/subtitles/out.srt",
      segments: [{ start_ms: 0, end_ms: 1000, text: "Hello everyone" }],
    });
  });
});
