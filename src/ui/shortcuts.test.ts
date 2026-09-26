// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import page from "../../index.html?raw";
import {
  SHORTCUTS,
  formatChord,
  shortcutById,
  shortcutText,
} from "./shortcuts";

const controllers = import.meta.glob<string>(
  ["../controllers/*_controller.ts"],
  { query: "?raw", import: "default", eager: true },
);

/** The key filters `source` binds in its actions, as `keydown.ctrl+z` names `ctrl+z`. */
function boundChords(source: string): string[] {
  return [...source.matchAll(/keydown\.([^\s-]+?)(?:@\w+)?->/g)].map(
    ([, chord]) => chord,
  );
}

describe("shortcuts", () => {
  // @behavior IF-036
  it("lists every key the page and its controllers bind", () => {
    const listed = new Set(
      SHORTCUTS.flatMap((shortcut) => [...shortcut.mac, ...shortcut.other]),
    );
    const bound = [page, ...Object.values(controllers)].flatMap(boundChords);

    expect([
      bound.length > 0,
      bound.filter((chord) => !listed.has(chord)),
    ]).toEqual([true, []]);
  });

  it("writes a chord as macOS draws it", () => {
    expect(formatChord("meta+alt+enter", true)).toBe("⌘⌥↩");
  });

  it("writes a chord with words joined by + elsewhere", () => {
    expect(formatChord("ctrl+alt+enter", false)).toBe("Ctrl+Alt+Enter");
  });

  it("writes every chord of a Shortcut, in the Interface Language", () => {
    expect(shortcutText(shortcutById("redo")!, false)).toBe(
      "Ctrl+Shift+Z 或 Ctrl+Y",
    );
  });
});
