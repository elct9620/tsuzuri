// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ProjectController from "./project_controller";

describe("ProjectController", () => {
  let application: Application;
  let calls: { command: string; args: unknown }[];
  let openSrt: () => unknown;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  function sent(command: string): unknown {
    return calls.find((call) => call.command === command)?.args;
  }

  beforeEach(async () => {
    calls = [];
    openSrt = () => null;
    document.body.innerHTML = `
      <header data-controller="project">
        <details open>
          <summary>開啟</summary>
          <button data-action="project#openSrt">從 SRT 建立</button>
        </details>
      </header>
    `;
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (command === "plugin:dialog|open") return "/subtitles/lecture.srt";
      if (command === "open_srt") return openSrt();
    });
    application = Application.start();
    application.register("project", ProjectController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior PJ-007
  it("opens the chosen SRT file as the Project", async () => {
    document.querySelector("button")!.click();
    await settle();

    expect(sent("open_srt")).toEqual({
      path: "/subtitles/lecture.srt",
      language: "zh-TW",
    });
  });

  // @behavior PJ-008
  it("says which cue kept the SRT file from being opened", async () => {
    openSrt = () => {
      throw { code: "malformed-srt", cue: 2 };
    };

    document.querySelector("button")!.click();
    await settle();

    expect(JSON.stringify(sent("plugin:dialog|message"))).toContain(
      "SRT 第 2 段無法讀取",
    );
  });
});
