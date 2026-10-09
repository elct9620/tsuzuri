// @vitest-environment happy-dom
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assemble } from "#/assembly.ts";
import type { ProjectView } from "#/ipc/project.ts";
import { pageContext } from "#/state/context.ts";
import { projectOf } from "#/testing/project.ts";
import { drawSegmentRows } from "#/testing/segment-rows.ts";
import { settle } from "#/testing/settle.ts";

describe("Glossary Marks", () => {
  let project: ProjectView;
  let highlights: Map<string, { ranges: Range[] }>;

  /** The text each range drawn under `name` covers. */
  const marked = (name: string) =>
    highlights.get(name)?.ranges.map(String) ?? [];

  async function show(): Promise<void> {
    await emit("project-changed");
    await settle();
    await settle();
  }

  beforeEach(async () => {
    highlights = new Map();
    vi.stubGlobal("CSS", { highlights });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
    project = projectOf({
      shown_translation: "en",
      segments: [
        {
          start_ms: 0,
          end_ms: 1000,
          text: "小林先生明天要去京都",
          translation: "Kobayashi goes to Kyoto",
        },
      ],
      glossary_marks: [
        {
          text: [
            { start: 0, end: 2, word: "小林", kind: "candidate" },
            { start: 8, end: 10, word: "京都", kind: "term" },
          ],
          translation: [{ start: 18, end: 23, word: "Kyoto", kind: "term" }],
        },
      ],
    });
    document.body.innerHTML = `<main></main>`;
    mockIPC(
      (command) => {
        if (command === "current_project") return project;
      },
      { shouldMockEvents: true },
    );
    const assembly = assemble();
    drawSegmentRows(
      document.querySelector("main")!,
      pageContext(assembly.feed, assembly.session),
    );
    await assembly.start();
    await settle();
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior GM-012
  it("underlines the terms and the candidates in their fields", async () => {
    await show();

    expect([marked("glossary-term"), marked("glossary-candidate")]).toEqual([
      ["京都", "Kyoto"],
      ["小林"],
    ]);
  });

  // @behavior GM-013
  it("leaves the marks out of a field typed in since they were found", async () => {
    const field = document.querySelector<HTMLElement>(".field.text")!;
    field.focus();
    field.textContent = "小林先生";

    // Each Project read is a new one, as the Rust side answers it anew
    project = { ...project };
    await show();

    expect(marked("glossary-candidate")).toEqual([]);
  });
});
