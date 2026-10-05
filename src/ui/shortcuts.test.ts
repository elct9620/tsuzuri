// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import menu from "../../src-tauri/src/menu.rs?raw";
import {
  SHORTCUTS,
  accelerator,
  formatChord,
  isShortcut,
  shortcutById,
  shortcutText,
} from "./shortcuts";

/** The page's markup and every module it runs, tests left out: `index.html`, Svelte Components and TS. */
const pageSources = [
  indexHtml,
  ...Object.values(
    import.meta.glob<string>(
      ["../**/*.svelte", "../**/*.ts", "!../**/*.test.ts", "!../**/test-*.ts"],
      { query: "?raw", import: "default", eager: true },
    ),
  ),
];

/** The Shortcuts `source` matches a key against, as `isShortcut(event, "search", isMac)` reads `search`. */
function shortcutIds(source: string): string[] {
  return [
    ...source.matchAll(/(?:isShortcut\(\s*\w+,|shortcutById\()\s*"(\w+)"/g),
  ].map(([, id]) => id);
}

/** The Shortcuts `source` names in a tooltip, as `data-shortcut="search"` names `search`. */
function tooltipShortcutIds(source: string): string[] {
  return [...source.matchAll(/data-shortcut="(\w+)"/g)].map(([, id]) => id);
}

/** The keys `source` gives its menu items on macOS, as `CmdOrCtrl+Shift+Z` is `meta+shift+z` there. */
function menuChords(source: string): string[] {
  return [...source.matchAll(/Some\("([^"]+)"\)/g)].map(([, accelerator]) =>
    accelerator.toLowerCase().replace("cmdorctrl", "meta"),
  );
}

const MOUSE_ACTIONS = ["click", "dblclick", "drag", "wheel"];

function isKeyboardChord(chord: string): boolean {
  return !MOUSE_ACTIONS.some((action) => chord.endsWith(action));
}

describe("shortcuts", () => {
  // @behavior IF-036
  it("lists every key the page and its modules bind", () => {
    const listedIds = new Set<string>(SHORTCUTS.map(({ id }) => id));
    const usedIds = pageSources.flatMap((source) => [
      ...shortcutIds(source),
      ...tooltipShortcutIds(source),
    ]);

    expect([
      usedIds.length > 0,
      usedIds.filter((id) => !listedIds.has(id)),
    ]).toEqual([true, []]);
  });

  // @behavior IF-043
  it("names no key that nothing binds", () => {
    const boundIds = new Set(pageSources.flatMap(shortcutIds));

    const unboundChords = SHORTCUTS.filter(
      (shortcut) => !boundIds.has(shortcut.id),
    )
      .flatMap((shortcut) => [...shortcut.mac, ...shortcut.other])
      .filter(isKeyboardChord);

    expect([boundIds.size > 0, unboundChords]).toEqual([true, []]);
  });

  // @behavior IF-044
  it("lists every key the app menu takes among the keys of macOS", () => {
    const macChords = new Set<string>(
      SHORTCUTS.flatMap((shortcut) => shortcut.mac),
    );
    const takenChords = menuChords(menu);

    expect([
      takenChords.length > 0,
      takenChords.filter((chord) => !macChords.has(chord)),
    ]).toEqual([true, []]);
  });

  it("reads a key by what the browser calls it", () => {
    const isPressed = (key: string, id: "play" | "cancel" | "stepBack") =>
      isShortcut(new KeyboardEvent("keydown", { key }), id, false);

    expect([
      isPressed(" ", "play"),
      isPressed("Escape", "cancel"),
      isPressed("ArrowLeft", "stepBack"),
      isPressed("ArrowRight", "stepBack"),
    ]).toEqual([true, true, true, false]);
  });

  it("writes a chord as macOS draws it", () => {
    expect(formatChord("meta+alt+enter", true)).toBe("⌘⌥↩");
  });

  it("keeps a word apart from the symbols before it on macOS", () => {
    expect(formatChord("meta+wheel", true)).toBe("⌘+滾輪");
  });

  it("writes a double click as a word of the Interface Language", () => {
    expect(formatChord("dblclick", false)).toBe("點兩下");
  });

  it("writes a chord with words joined by + elsewhere", () => {
    expect(formatChord("ctrl+alt+enter", false)).toBe("Ctrl+Alt+Enter");
  });

  it("writes a Shortcut's first chord as a menu of the system reads it", () => {
    expect([
      accelerator("split", true),
      accelerator("split", false),
      accelerator("delete", true),
    ]).toEqual(["Cmd+Alt+Enter", "Ctrl+Alt+Enter", "Backspace"]);
  });

  it("gives a menu of the system no keys for a mouse action", () => {
    expect(accelerator("checkRange", false)).toBeUndefined();
  });

  it("writes every chord of a Shortcut, in the Interface Language", () => {
    expect(shortcutText(shortcutById("redo"), false)).toBe(
      "Ctrl+Shift+Z 或 Ctrl+Y",
    );
  });
});
