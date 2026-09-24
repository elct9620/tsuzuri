// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TranscriptController from "./transcript_controller";

describe("TranscriptController", () => {
  let application: Application;

  beforeEach(async () => {
    document.body.innerHTML = `
      <section data-controller="transcript" data-action="transcribe:loaded@window->transcript#show translate:loaded@window->transcript#show">
        <p data-transcript-target="empty">尚無內容</p>
        <ol data-transcript-target="list"></ol>
      </section>
    `;
    application = Application.start();
    application.register("transcript", TranscriptController);
    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
  });

  // @behavior TX-006
  it("lists each segment with its start and end time", () => {
    const segments = [
      { start_ms: 0, end_ms: 1000, text: "大家好" },
      { start_ms: 62_003, end_ms: 64_500, text: "今天天氣很好" },
    ];

    window.dispatchEvent(new CustomEvent("transcribe:loaded", { detail: { segments } }));

    const items = [...document.querySelectorAll("li")].map((item) => item.textContent);
    expect(items).toEqual(["00:00:00.000 → 00:00:01.000大家好", "00:01:02.003 → 00:01:04.500今天天氣很好"]);
  });

  // @behavior TL-006
  it("shows each translation under its segment", () => {
    const segments = [{ start_ms: 0, end_ms: 1000, text: "大家好", translation: "Hello everyone" }];

    window.dispatchEvent(new CustomEvent("translate:loaded", { detail: { segments } }));

    const lines = [...document.querySelectorAll("li p")].map((line) => line.textContent);
    expect(lines).toEqual(["大家好", "Hello everyone"]);
  });
});
