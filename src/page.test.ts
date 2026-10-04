// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { drawPage } from "./page";

describe("drawPage", () => {
  // Each part is found by what its controller or module reads, so a Svelte Component left out of
  // the page leaves nothing for them to read.
  it.each([
    ["start screen", '[data-project-target="startScreen"]'],
    ["editor bar", '[data-controller="versions"]'],
    ["preview", '[data-preview-target="panel"]'],
    ["Segment list", '[data-transcript-target="list"]'],
    ["resource list", '[data-controller="glossary"]'],
    ["shortcuts dialog", '[data-shortcuts-target="dialog"]'],
    ["updates dialog", '[data-updates-target="dialog"]'],
    ["notification stack", "[data-notifications]"],
    ["tooltip bubble", '[data-tooltip-target="bubble"]'],
  ])("writes the %s", (_part, selector) => {
    const page = document.createElement("div");

    drawPage(page);

    expect(page.querySelector(selector)).not.toBeNull();
  });
});
