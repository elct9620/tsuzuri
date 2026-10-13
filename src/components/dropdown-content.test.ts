// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

/** Every Svelte Component's markup by path from the project's root. */
const componentSources = import.meta.glob<string>("/src/**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Tailwind's `display` utilities. daisyUI hides a closed dropdown with `display: none` from a nested
 * layer these outrank, so one on a `dropdown-content` leaves the closed menu invisible yet clickable.
 */
const DISPLAY_UTILITY =
  /^(block|inline|inline-block|flow-root|flex|inline-flex|grid|inline-grid|contents|list-item|hidden|table|inline-table|table-[a-z-]+)$/;

/** The display utilities `source` puts on a `dropdown-content`, variants such as `md:` included. */
function displayUtilitiesOnDropdownContent(source: string): string[] {
  return [...source.matchAll(/["'`]([^"'`]*\bdropdown-content\b[^"'`]*)["'`]/g)]
    .flatMap(([, classes]) => classes.split(/\s+/))
    .filter((name) => DISPLAY_UTILITY.test(name.split(":").pop()!));
}

describe("a dropdown's content", () => {
  it("finds a display utility beside dropdown-content, behind a variant too", () => {
    const source = `<div class="dropdown-content md:grid w-40"></div><ul class="menu dropdown-content flex"></ul>`;

    expect(displayUtilitiesOnDropdownContent(source)).toEqual([
      "md:grid",
      "flex",
    ]);
  });

  it("leaves its display to daisyUI, so a closed menu takes no clicks", () => {
    const sourcesWithDropdownContent = Object.entries(componentSources).filter(
      ([, source]) => source.includes("dropdown-content"),
    );

    const utilitiesByPath = Object.fromEntries(
      sourcesWithDropdownContent
        .map(([path, source]) => [
          path,
          displayUtilitiesOnDropdownContent(source),
        ])
        .filter(([, utilities]) => utilities.length > 0),
    );

    expect(sourcesWithDropdownContent.length).toBeGreaterThan(0);
    expect(utilitiesByPath).toEqual({});
  });
});
