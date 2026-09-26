import { t } from "../i18n";

/** Where a shortcut works, which is how the shortcut list groups them. */
export type ShortcutGroup = "anywhere" | "playback" | "field" | "mouse";

/**
 * A key the interface binds, or a mouse action with the keys held, as each platform presses it. A
 * chord is written as a Stimulus key filter, `ctrl+alt+enter`; `click`, `drag` and `wheel` stand
 * for the mouse.
 */
export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  mac: string[];
  other: string[];
}

/**
 * Every shortcut, in the order the list shows them. Only what is shown is kept here; each binding
 * stays in the `data-action` or controller that acts on it.
 */
export const SHORTCUTS: Shortcut[] = [
  {
    id: "list",
    group: "anywhere",
    mac: ["meta+/", "?"],
    other: ["ctrl+/", "?"],
  },
  { id: "undo", group: "anywhere", mac: ["meta+z"], other: ["ctrl+z"] },
  {
    id: "redo",
    group: "anywhere",
    mac: ["meta+shift+z", "meta+y"],
    other: ["ctrl+shift+z", "ctrl+y"],
  },
  { id: "checkAll", group: "anywhere", mac: ["meta+a"], other: ["ctrl+a"] },
  { id: "replace", group: "anywhere", mac: ["meta+alt+f"], other: ["ctrl+h"] },
  { id: "reload", group: "anywhere", mac: ["meta+r"], other: ["ctrl+r"] },
  { id: "following", group: "anywhere", mac: ["meta+l"], other: ["ctrl+l"] },
  { id: "play", group: "playback", mac: ["space"], other: ["space"] },
  // macOS shows the desktop with F11
  { id: "setStart", group: "playback", mac: ["f9"], other: ["f11"] },
  { id: "setEnd", group: "playback", mac: ["f12"], other: ["f12"] },
  { id: "insertRange", group: "playback", mac: ["enter"], other: ["enter"] },
  { id: "cancel", group: "playback", mac: ["esc"], other: ["esc"] },
  { id: "next", group: "field", mac: ["enter"], other: ["enter"] },
  {
    id: "lineBreak",
    group: "field",
    mac: ["shift+enter"],
    other: ["shift+enter"],
  },
  { id: "revert", group: "field", mac: ["esc"], other: ["esc"] },
  {
    id: "split",
    group: "field",
    mac: ["meta+alt+enter"],
    other: ["ctrl+alt+enter"],
  },
  {
    id: "checkRange",
    group: "mouse",
    mac: ["shift+click"],
    other: ["shift+click"],
  },
  {
    id: "snapping",
    group: "mouse",
    mac: ["shift+drag"],
    other: ["shift+drag"],
  },
  {
    id: "shareBoundary",
    group: "mouse",
    mac: ["alt+drag"],
    other: ["alt+drag"],
  },
  {
    id: "zoom",
    group: "mouse",
    mac: ["meta+wheel", "alt+wheel"],
    other: ["ctrl+wheel", "alt+wheel"],
  },
];

/** How macOS writes the keys it draws as symbols; every other platform writes them as words. */
const MAC_LABELS: Record<string, string> = {
  ctrl: "⌃",
  meta: "⌘",
  alt: "⌥",
  shift: "⇧",
  enter: "↩",
};

const OTHER_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
};

/** The keys and mouse actions written as words of the Interface Language. */
const WORDS = ["space", "click", "drag", "wheel"];

export function shortcutById(id: string): Shortcut | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.id === id);
}

/** The chords that press `shortcut` on this platform. */
export function chords(shortcut: Shortcut, isMac: boolean): string[] {
  return isMac ? shortcut.mac : shortcut.other;
}

/** Each key of `chord` as the keyboard shows it: `⌘` `⌥` `F` on macOS, `Ctrl` `H` elsewhere. */
export function keyLabels(chord: string, isMac: boolean): string[] {
  const labels = isMac ? MAC_LABELS : OTHER_LABELS;
  return chord.split("+").map((key) => {
    if (WORDS.includes(key)) return t(`shortcuts.keys.${key}`);
    return labels[key] ?? (key === "esc" ? "Esc" : key.toUpperCase());
  });
}

/** `chord` as one piece of text: `⌘⌥F` on macOS, `Ctrl+H` elsewhere. */
export function formatChord(chord: string, isMac: boolean): string {
  return keyLabels(chord, isMac).join(isMac ? "" : "+");
}

/** Every chord of `shortcut` on this platform as text, for a tooltip or a menu. */
export function shortcutText(shortcut: Shortcut, isMac: boolean): string {
  return chords(shortcut, isMac)
    .map((chord) => formatChord(chord, isMac))
    .join(t("shortcuts.or"));
}
