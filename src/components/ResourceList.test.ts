// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ResourceList from "./ResourceList.svelte";

describe("ResourceList", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    mockIPC((command) => {
      if (command === "translation_glossary_table")
        return {
          languages: ["zh-TW"],
          rows: [],
          has_source_target_header: false,
        };
    });
  });

  afterEach(() => {
    clearMocks();
  });

  it("opens the glossary dialog from its entry", async () => {
    const { container } = render(ResourceList);
    await settle();

    container
      .querySelector<HTMLElement>('[data-project-target="glossary"]')!
      .click();
    await settle();

    expect(
      screen
        .getByRole("heading", { hidden: true, name: "詞彙表" })
        .closest("dialog")!.open,
    ).toBe(true);
  });
});
