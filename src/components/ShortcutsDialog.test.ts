// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setInterfaceLanguage } from "#/i18n.ts";
import ShortcutsDialog from "#/components/ShortcutsDialog.svelte";

describe("ShortcutsDialog", () => {
  let shortcutsDialog: ShortcutsDialog;

  const dialog = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  /** Each shortcut listed, read once the list has been written. */
  function rows() {
    flushSync();
    return within(dialog())
      .queryAllByRole("listitem", { hidden: true })
      .map((row) => ({
        name: row.firstElementChild?.textContent,
        text: row.textContent,
        tip: row.dataset.tooltip,
        keys: [...row.querySelectorAll("kbd")].map((key) => key.textContent),
      }));
  }
  const keysOf = (name: string) =>
    rows().find((row) => row.name === name)?.keys;

  function press(selector: string, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.querySelector(selector)!.dispatchEvent(event);
    return event;
  }

  function usePlatform(platform: string): void {
    Object.assign(window, { __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
  }

  beforeEach(() => {
    document.body.innerHTML = `<input id="typing" /><button id="elsewhere"></button>`;
    shortcutsDialog = render(ShortcutsDialog).component;
  });

  afterEach(async () => {
    usePlatform("linux");
    await setInterfaceLanguage("zh-Hant-TW");
  });

  // @behavior IF-030
  it("opens the list with Ctrl+/ even while a text is typed", () => {
    press("#typing", { key: "/", code: "Slash", ctrlKey: true });

    expect(dialog().open).toBe(true);
  });

  it("opens the list with Ctrl+/ where / is typed with Shift", () => {
    press("#typing", {
      key: "/",
      code: "Digit7",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(dialog().open).toBe(true);
  });

  // @behavior IF-031
  it("opens the list with ? outside a text field", () => {
    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    expect(dialog().open).toBe(true);
  });

  // @behavior IF-032
  it("leaves ? to the text field being typed in", () => {
    const event = press("#typing", { key: "?", code: "Slash", shiftKey: true });

    expect([dialog().open, event.defaultPrevented]).toEqual([false, false]);
  });

  it("opens the list with ⌘/ on macOS, leaving Ctrl+/ alone", () => {
    usePlatform("macos");

    press("#typing", { key: "/", code: "Slash", ctrlKey: true });
    const isOpenByCtrl = dialog().open;
    press("#typing", { key: "/", code: "Slash", metaKey: true });

    expect([isOpenByCtrl, dialog().open]).toEqual([false, true]);
  });

  it.each<[string, KeyboardEventInit]>([
    ["Ctrl+Alt+/", { key: "/", ctrlKey: true, altKey: true }],
    ["Ctrl+Meta+/", { key: "/", ctrlKey: true, metaKey: true }],
    ["Ctrl+/ while composing", { key: "/", ctrlKey: true, isComposing: true }],
    ["/", { key: "/" }],
    ["Ctrl+?", { key: "?", shiftKey: true, ctrlKey: true }],
    ["Meta+?", { key: "?", shiftKey: true, metaKey: true }],
    ["Alt+?", { key: "?", shiftKey: true, altKey: true }],
    ["? while composing", { key: "?", shiftKey: true, isComposing: true }],
  ])("leaves %s alone", (_name, init) => {
    press("#elsewhere", init);

    expect(dialog().open).toBe(false);
  });

  // @behavior IF-033
  it("lists only the keys of macOS on macOS", () => {
    usePlatform("macos");

    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    expect([
      keysOf("取代"),
      rows().some((row) => row.keys.includes("Ctrl")),
    ]).toEqual([["⌘", "⌥", "F"], false]);
  });

  it("lists the keys of Linux on Linux", () => {
    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    expect(keysOf("取代")).toEqual(["Ctrl", "H"]);
  });

  // @behavior IF-045
  it("lists Esc beside the double click for the Video Window's full screen", () => {
    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    expect(keysOf("影片視窗全螢幕")).toEqual(["點兩下", "Esc"]);
  });

  // @behavior IF-034
  it.each(["en", "zh-Hant-TW"])(
    "explains every shortcut in its tooltip in %s",
    async (language) => {
      await setInterfaceLanguage(language);

      shortcutsDialog.open();

      const rowsWithoutTip = rows().filter(
        (row) => !row.tip || row.tip.startsWith("shortcuts."),
      );
      const rowsWithoutName = rows().filter((row) =>
        row.text?.includes("shortcuts."),
      );
      expect([rows().length > 0, rowsWithoutTip, rowsWithoutName]).toEqual([
        true,
        [],
        [],
      ]);
    },
  );
});
