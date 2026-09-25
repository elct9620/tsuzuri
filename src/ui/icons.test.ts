// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { iconElement, showIcons } from "./icons";

describe("icons", () => {
  it("draws an element naming an icon as that icon, keeping its classes", () => {
    document.body.innerHTML = `<p><i data-lucide="info" class="size-3"></i></p>`;

    showIcons(document.body);

    const svg = document.querySelector("p > svg");
    expect([
      svg?.classList.contains("size-3"),
      svg?.getAttribute("aria-hidden"),
      document.querySelector("i"),
    ]).toEqual([true, "true", null]);
  });

  it("makes one icon for code to place", () => {
    const svg = iconElement("RotateCcw");

    expect([svg.tagName.toLowerCase(), svg.getAttribute("class")]).toEqual([
      "svg",
      "size-4",
    ]);
  });
});
