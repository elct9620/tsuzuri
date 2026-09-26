import { Controller } from "@hotwired/stimulus";

import { isMacOS } from "../backend/system";
import { isTextField } from "../editor";
import { t } from "../i18n";
import {
  SHORTCUTS,
  type ShortcutGroup,
  chords,
  keyLabels,
} from "../ui/shortcuts";

const GROUPS: ShortcutGroup[] = ["anywhere", "playback", "field", "mouse"];

/**
 * Whether `event` asks for the shortcut list: ⌘/ or Ctrl+/ anywhere, or ? where no text is typed.
 * `/` is read as the key typed, since some keyboards type it with Shift.
 */
function isListShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing || event.altKey) return false;
  const isMac = isMacOS();
  const hasModifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (event.key === "/") return hasModifier;
  return (
    event.key === "?" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isTextField(event.target)
  );
}

/** One chord as a `kbd` for each key. */
function chordElement(chord: string, isMac: boolean): HTMLElement {
  const keys = document.createElement("span");
  keys.className = "flex gap-0.5";
  for (const label of keyLabels(chord, isMac)) {
    const key = document.createElement("kbd");
    key.className = "kbd kbd-sm";
    key.textContent = label;
    keys.append(key);
  }
  return keys;
}

/**
 * The shortcut list: every shortcut of this platform, grouped by where it works, each explaining
 * itself in its tooltip. It only tells; the keys are bound where they act.
 */
export default class ShortcutsController extends Controller {
  static targets = ["dialog", "list"];

  declare readonly dialogTarget: HTMLDialogElement;
  declare readonly listTarget: HTMLElement;

  /** Opens the list; bound to `keydown@window`, it acts only on the list's own shortcuts. */
  openByShortcut(event: KeyboardEvent): void {
    if (!isListShortcut(event) || this.dialogTarget.open) return;
    event.preventDefault();
    this.open();
  }

  open(): void {
    this.showShortcuts();
    this.dialogTarget.showModal();
  }

  private showShortcuts(): void {
    const isMac = isMacOS();
    this.listTarget.replaceChildren(
      ...GROUPS.map((group) => {
        const section = document.createElement("section");
        const heading = document.createElement("h4");
        heading.className =
          "mt-3 mb-1 text-sm font-semibold text-base-content/70";
        heading.textContent = t(`shortcuts.groups.${group}`);
        const rows = document.createElement("ul");
        for (const shortcut of SHORTCUTS.filter(
          (each) => each.group === group,
        )) {
          const row = document.createElement("li");
          row.className = "flex items-center justify-between gap-4 py-1";
          row.dataset.shortcutId = shortcut.id;
          row.dataset.tooltip = t(`shortcuts.hints.${shortcut.id}`);
          const name = document.createElement("span");
          name.textContent = t(`shortcuts.names.${shortcut.id}`);
          const keys = document.createElement("span");
          keys.className = "flex items-center gap-1 text-xs";
          chords(shortcut, isMac).forEach((chord, index) => {
            if (index > 0) keys.append(t("shortcuts.or").trim());
            keys.append(chordElement(chord, isMac));
          });
          row.append(name, keys);
          rows.append(row);
        }
        section.append(heading, rows);
        return section;
      }),
    );
  }
}
