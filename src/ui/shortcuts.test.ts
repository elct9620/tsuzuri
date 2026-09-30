// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import page from "../../index.html?raw";
import menu from "../../src-tauri/src/menu.rs?raw";
import {
  SHORTCUTS,
  formatChord,
  isShortcut,
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

/** The Shortcuts `source` reads from the list, as `isShortcut(event, "search", isMac)` reads `search`. */
function shortcutIds(source: string): string[] {
  return [
    ...source.matchAll(/(?:isShortcut\(\s*\w+,|shortcutById\()\s*"(\w+)"/g),
  ].map(([, id]) => id);
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
  it("lists every key the page and its controllers bind", () => {
    const listedChords = new Set<string>(
      SHORTCUTS.flatMap((shortcut) => [...shortcut.mac, ...shortcut.other]),
    );
    const usedChords = [page, ...Object.values(controllers)].flatMap(
      boundChords,
    );

    expect([
      usedChords.length > 0,
      usedChords.filter((chord) => !listedChords.has(chord)),
    ]).toEqual([true, []]);
  });

  // @behavior IF-043
  it("names no key that nothing binds", () => {
    const sources = Object.values(controllers);
    const boundChordSet = new Set([page, ...sources].flatMap(boundChords));
    const shortcutIdSet = new Set(sources.flatMap(shortcutIds));

    const unboundChords = SHORTCUTS.filter(
      (shortcut) => !shortcutIdSet.has(shortcut.id),
    )
      .flatMap((shortcut) => [...shortcut.mac, ...shortcut.other])
      .filter((chord) => isKeyboardChord(chord) && !boundChordSet.has(chord));

    expect([shortcutIdSet.size > 0, unboundChords]).toEqual([true, []]);
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

  it("writes a chord with words joined by + elsewhere", () => {
    expect(formatChord("ctrl+alt+enter", false)).toBe("Ctrl+Alt+Enter");
  });

  it("writes every chord of a Shortcut, in the Interface Language", () => {
    expect(shortcutText(shortcutById("redo"), false)).toBe(
      "Ctrl+Shift+Z 或 Ctrl+Y",
    );
  });
});
