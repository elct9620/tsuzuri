// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

/** Every Svelte Component's markup by path from the project's root. */
const componentSources = import.meta.glob<string>("/src/**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * The elements `source` lets skip their rendering off screen, by the variant naming them, that do
 * not show in full while focus is inside. Skipping clips what overflows the element, so a focus
 * dropdown opened inside one would be cut at its edge.
 */
function skippingWithoutFocusOverride(source: string): string[] {
  return [
    ...source.matchAll(
      /["'`]([^"'`]*\[content-visibility:auto\][^"'`]*)["'`]/g,
    ),
  ]
    .map(([, classList]) => new Set(classList.split(/\s+/)))
    .flatMap((classes) =>
      [...classes]
        .filter((name) => name.endsWith("[content-visibility:auto]"))
        .map((name) => name.slice(0, -"[content-visibility:auto]".length))
        .filter((variant) => {
          const focused = variant.startsWith("[")
            ? `${variant.slice(0, variant.indexOf("]:"))}:focus-within]:`
            : `${variant}focus-within:`;
          return !classes.has(`${focused}[content-visibility:visible]`);
        }),
    );
}

describe("an element skipping its rendering off screen", () => {
  it("finds one with no override for focus inside, behind a variant too", () => {
    const source = `<ol class="[&>li]:[content-visibility:auto]"></ol><ul class="[&>li]:[content-visibility:auto] [&>li:focus-within]:[content-visibility:visible]"></ul><div class="[content-visibility:auto]"></div>`;

    expect(skippingWithoutFocusOverride(source)).toEqual(["[&>li]:", ""]);
  });

  it("shows in full while focus is inside, so a dropdown opened there is not cut", () => {
    const skipping = Object.entries(componentSources).filter(([, source]) =>
      source.includes("[content-visibility:auto]"),
    );

    const unprotectedByPath = Object.fromEntries(
      skipping
        .map(([path, source]) => [path, skippingWithoutFocusOverride(source)])
        .filter(([, variants]) => variants.length > 0),
    );

    expect(skipping.length).toBeGreaterThan(0);
    expect(unprotectedByPath).toEqual({});
  });
});
