import { t } from "../i18n";

/** Where a shortcut works, which is how the shortcut list groups them, in this order. */
export const SHORTCUT_GROUPS = [
  "anywhere",
  "playback",
  "field",
  "mouse",
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/**
 * A key the interface binds, or a mouse action with the keys held, as each platform presses it. A
 * chord is written as a Stimulus key filter, `ctrl+alt+enter`; `click`, `dblclick`, `drag` and
 * `wheel` stand for the mouse.
 */
export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  mac: readonly string[];
  other: readonly string[];
  /** The chords whose letter is read by where its key is on the keyboard, not by what it types. */
  byPosition?: readonly string[];
  /** The chords pressed with Shift held or not. */
  anyShift?: readonly string[];
}

/**
 * Every shortcut, in the order the list shows them. A controller that matches a key itself reads it
 * from here with `isShortcut`; a key bound in a `data-action` is written there as well.
 */
export const SHORTCUTS = [
  // Some keyboards type / with Shift, and ? takes it on most
  {
    id: "list",
    group: "anywhere",
    mac: ["meta+/", "?"],
    other: ["ctrl+/", "?"],
    anyShift: ["meta+/", "ctrl+/", "?"],
  },
  { id: "undo", group: "anywhere", mac: ["meta+z"], other: ["ctrl+z"] },
  {
    id: "redo",
    group: "anywhere",
    mac: ["meta+shift+z", "meta+y"],
    other: ["ctrl+shift+z", "ctrl+y"],
  },
  { id: "checkAll", group: "anywhere", mac: ["meta+a"], other: ["ctrl+a"] },
  // Backspace on macOS too, where the key labelled delete types it and a forward Delete takes Fn
  {
    id: "delete",
    group: "anywhere",
    mac: ["backspace", "delete"],
    other: ["delete"],
  },
  // The keys of a split with the direction to merge, in a text field as well, as a merge needs no Cursor
  {
    id: "mergeWithPrevious",
    group: "anywhere",
    mac: ["meta+alt+up"],
    other: ["ctrl+alt+up"],
  },
  {
    id: "mergeWithNext",
    group: "anywhere",
    mac: ["meta+alt+down"],
    other: ["ctrl+alt+down"],
  },
  // Ctrl+H as subtitle editors bind it; ⌘+Option+F on macOS, where ⌘+H hides the app and Ctrl+H
  // deletes backward in a text. Option changes the key typed, so F is read by its place
  {
    id: "replace",
    group: "anywhere",
    mac: ["meta+alt+f"],
    other: ["ctrl+h"],
    byPosition: ["meta+alt+f"],
    anyShift: ["meta+alt+f"],
  },
  // ⌘F on macOS, where Ctrl+F moves forward in a text
  {
    id: "search",
    group: "anywhere",
    mac: ["meta+f"],
    other: ["ctrl+f"],
    byPosition: ["meta+f", "ctrl+f"],
  },
  // ⌘G on macOS, where F3 belongs to the system
  {
    id: "searchNext",
    group: "anywhere",
    mac: ["meta+g"],
    other: ["f3"],
    byPosition: ["meta+g"],
  },
  {
    id: "searchPrevious",
    group: "anywhere",
    mac: ["meta+shift+g"],
    other: ["shift+f3"],
    byPosition: ["meta+shift+g"],
  },
  {
    id: "cleanup",
    group: "anywhere",
    mac: ["meta+shift+t"],
    other: ["ctrl+shift+t"],
  },
  { id: "reload", group: "anywhere", mac: ["meta+r"], other: ["ctrl+r"] },
  { id: "following", group: "anywhere", mac: ["meta+l"], other: ["ctrl+l"] },
  // ⌘B as editors with a sidebar bind it
  {
    id: "resourceList",
    group: "anywhere",
    mac: ["meta+b"],
    other: ["ctrl+b"],
  },
  { id: "play", group: "playback", mac: ["space"], other: ["space"] },
  // F11 and F12 as Subtitle Edit binds them, but F9 on macOS, which shows the desktop with F11
  { id: "setStart", group: "playback", mac: ["f9"], other: ["f11"] },
  { id: "setEnd", group: "playback", mac: ["f12"], other: ["f12"] },
  { id: "stepBack", group: "playback", mac: ["left"], other: ["left"] },
  { id: "stepForward", group: "playback", mac: ["right"], other: ["right"] },
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
  // ⌘ on macOS, where Ctrl and a click open the context menu
  {
    id: "drawOver",
    group: "mouse",
    mac: ["meta+drag"],
    other: ["ctrl+drag"],
  },
  // The wheel zooms under Ctrl, Alt or ⌘ on every platform, a trackpad pinch reporting itself as
  // Ctrl; each platform is shown its own command key, and Alt as Subtitle Edit zooms
  {
    id: "zoom",
    group: "mouse",
    mac: ["meta+wheel", "alt+wheel"],
    other: ["ctrl+wheel", "alt+wheel"],
  },
  {
    id: "videoWindowFullscreen",
    group: "mouse",
    mac: ["dblclick", "esc"],
    other: ["dblclick", "esc"],
  },
] as const satisfies readonly Shortcut[];

/** What a Shortcut is known by: the key of its words, and what an element's `data-shortcut` names. */
export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

/** How macOS writes the keys it draws as symbols; every other platform writes them as words. */
const MAC_LABELS: Record<string, string> = {
  ctrl: "⌃",
  meta: "⌘",
  alt: "⌥",
  shift: "⇧",
  enter: "↩",
  backspace: "⌫",
  delete: "⌦",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
};

const OTHER_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  delete: "Delete",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
};

/** The keys and mouse actions written as words of the Interface Language. */
const WORDS = ["space", "click", "dblclick", "drag", "wheel"];

const MODIFIERS = ["meta", "ctrl", "alt", "shift"] as const;

/** What `KeyboardEvent.key` calls the keys a chord names otherwise. */
const EVENT_KEYS: Record<string, string> = {
  esc: "Escape",
  space: " ",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
};

/** The shortcut `id` names, or none for a name an element's `data-shortcut` got wrong. */
export function shortcutById(id: ShortcutId): Shortcut;
export function shortcutById(id: string): Shortcut | undefined;
export function shortcutById(id: string): Shortcut | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.id === id);
}

/** The chords that press `shortcut` on this platform. */
export function chords(shortcut: Shortcut, isMac: boolean): readonly string[] {
  return isMac ? shortcut.mac : shortcut.other;
}

/** Whether `event` presses `chord` of `shortcut`: its modifiers and no others, and its key. */
function isChord(
  event: KeyboardEvent,
  chord: string,
  shortcut: Shortcut,
): boolean {
  const keys = chord.split("+");
  const key = keys[keys.length - 1];
  const isHeld = {
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
  const hasModifiers = MODIFIERS.every(
    (modifier) =>
      isHeld[modifier] === keys.includes(modifier) ||
      (modifier === "shift" && shortcut.anyShift?.includes(chord)),
  );
  if (!hasModifiers) return false;
  if (shortcut.byPosition?.includes(chord))
    return event.code === `Key${key.toUpperCase()}`;
  return event.key.toLowerCase() === (EVENT_KEYS[key] ?? key).toLowerCase();
}

/**
 * Whether `event` presses the Shortcut `id` names on this platform. A key is read as it is typed
 * and with exactly the modifiers its chord names, as a Stimulus key filter reads one, unless the
 * Shortcut says otherwise.
 */
export function isShortcut(
  event: KeyboardEvent,
  id: ShortcutId,
  isMac: boolean,
): boolean {
  const shortcut = shortcutById(id);
  return chords(shortcut, isMac).some((chord) =>
    isChord(event, chord, shortcut),
  );
}

/** Each key of `chord` as the keyboard shows it: `⌘` `⌥` `F` on macOS, `Ctrl` `H` elsewhere. */
export function keyLabels(chord: string, isMac: boolean): string[] {
  const labels = isMac ? MAC_LABELS : OTHER_LABELS;
  return chord.split("+").map((key) => {
    if (WORDS.includes(key)) return t(`shortcuts.keys.${key}`);
    return labels[key] ?? (key === "esc" ? "Esc" : key.toUpperCase());
  });
}

/**
 * `chord` as one piece of text: `⌘⌥F` on macOS, `Ctrl+H` elsewhere. A word stays apart from the
 * symbols before it, as in `⌘+滾輪`.
 */
export function formatChord(chord: string, isMac: boolean): string {
  if (!isMac) return keyLabels(chord, isMac).join("+");
  const keys = chord.split("+");
  return keyLabels(chord, isMac)
    .map((label, index) =>
      index > 0 && WORDS.includes(keys[index]) ? `+${label}` : label,
    )
    .join("");
}

/** The modifiers as a menu of the system names them in an accelerator. */
const ACCELERATOR_MODIFIERS: Record<string, string> = {
  meta: "Cmd",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/**
 * The first chord of the Shortcut `id` on this platform as a menu of the system reads it, as
 * `Ctrl+Alt+Enter`, or none for a mouse action, which such a menu cannot show.
 */
export function accelerator(id: string, isMac: boolean): string | undefined {
  const shortcut = shortcutById(id);
  const chord = shortcut && chords(shortcut, isMac)[0];
  const keys = chord?.split("+") ?? [];
  if (keys.length === 0 || keys.some((key) => WORDS.includes(key)))
    return undefined;
  return keys
    .map(
      (key) =>
        ACCELERATOR_MODIFIERS[key] ?? key[0].toUpperCase() + key.slice(1),
    )
    .join("+");
}

/** Every chord of `shortcut` on this platform as text, for a tooltip or a menu. */
export function shortcutText(shortcut: Shortcut, isMac: boolean): string {
  return chords(shortcut, isMac)
    .map((chord) => formatChord(chord, isMac))
    .join(t("shortcuts.or"));
}
