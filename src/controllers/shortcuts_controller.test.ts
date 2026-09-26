// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setInterfaceLanguage } from "../i18n";
import ShortcutsController from "./shortcuts_controller";

describe("ShortcutsController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = () =>
    document.querySelector<HTMLDialogElement>(
      '[data-shortcuts-target="dialog"]',
    )!;
  const rows = () =>
    [...document.querySelectorAll<HTMLElement>("[data-shortcut-id]")].map(
      (row) => ({
        id: row.dataset.shortcutId,
        text: row.textContent,
        tip: row.dataset.tooltip,
        keys: [...row.querySelectorAll("kbd")].map((key) => key.textContent),
      }),
    );

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

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="shortcuts" data-action="keydown@window->shortcuts#openByShortcut">
        <input id="typing" />
        <button id="elsewhere" data-action="shortcuts#open"></button>
        <dialog data-shortcuts-target="dialog">
          <div data-shortcuts-target="list"></div>
        </dialog>
      </div>
    `;
    application = Application.start();
    application.register("shortcuts", ShortcutsController);
    await settle();
  });

  afterEach(async () => {
    application.stop();
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

  // @behavior IF-033
  it("lists only the keys of macOS on macOS", () => {
    usePlatform("macos");

    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    const shortcuts = rows();
    expect([
      shortcuts.find((row) => row.id === "replace")?.keys,
      shortcuts.some((row) => row.keys.includes("Ctrl")),
    ]).toEqual([["⌘", "⌥", "F"], false]);
  });

  it("lists the keys of Linux on Linux", () => {
    press("#elsewhere", { key: "?", code: "Slash", shiftKey: true });

    expect(rows().find((row) => row.id === "replace")?.keys).toEqual([
      "Ctrl",
      "H",
    ]);
  });

  // @behavior IF-034
  it.each(["en", "zh-Hant-TW"])(
    "explains every shortcut in its tooltip in %s",
    async (language) => {
      await setInterfaceLanguage(language);

      document.querySelector<HTMLElement>("#elsewhere")!.click();

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
