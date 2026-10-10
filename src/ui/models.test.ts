// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { chosenModelName } from "#/ui/models.ts";

describe("chosenModelName", () => {
  it("names the file of a Repository's Model", () => {
    const name = chosenModelName({
      kind: "repository",
      repo: "ggerganov/whisper.cpp",
      file: "ggml-large-v3.bin",
      commit: "abc123",
    });

    expect(name).toBe("ggml-large-v3.bin");
  });

  it("says no Model is chosen when there is none", () => {
    expect(chosenModelName(null)).toBe("尚未指定");
  });
});
