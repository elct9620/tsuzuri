// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectOf } from "../../../test-project";
import Transcription from "./Transcription.svelte";

describe("Transcription", () => {
  let calls: { command: string; args: unknown }[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = (command: string) =>
    calls.find((call) => call.command === command)?.args;

  beforeEach(() => {
    calls = [];
    mockIPC((command, args) => {
      calls.push({ command, args });
    });
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior TX-040
  it("sets VAD on for the Project with the rest following the general settings", async () => {
    render(Transcription, { project: projectOf() });
    const vad = screen.getByText("VAD").closest("li")!.querySelector("select")!;

    vad.value = "on";
    vad.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();

    expect(sent("set_project_options")).toEqual({
      options: {
        ...projectOf().options,
        transcription: {
          has_vad: true,
          is_non_speech_suppressed: null,
          is_context_carried: null,
          is_simplified_cleaned: null,
        },
      },
    });
  });
});
