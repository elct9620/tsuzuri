// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResourceListController from "./resource_list_controller";

describe("ResourceListController", () => {
  let application: Application;
  let isPortrait: boolean;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const drawer = () => document.querySelector<HTMLElement>(".drawer")!;
  const toggle = () => document.querySelector<HTMLInputElement>("#toggle")!;
  const isDocked = () => drawer().hasAttribute("data-is-docked");

  /** Opens the page in a window held portrait or not, wide enough to dock the list unless `isNarrow`. */
  async function open({
    isNarrow = false,
    platform = "macos",
  } = {}): Promise<void> {
    Object.assign(window, { __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
    document.body.innerHTML = `
      <div class="drawer" data-controller="resource-list"
        data-action="system:orientation@window->resource-list#follow keydown@window->resource-list#toggleByShortcut">
        <input id="toggle" type="checkbox" data-resource-list-target="toggle">
        <label for="toggle" data-resource-list-target="overlayButton" style="${isNarrow ? "" : "display: none"}"></label>
        <button id="dock" data-resource-list-target="dockButton" data-action="resource-list#toggleDocked"><span data-resource-list-target="dockIcon"></span></button>
      </div>
    `;
    application = Application.start();
    application.register("resource-list", ResourceListController);
    await settle();
  }

  /** Starts the page over, as the next time the app opens. */
  async function reopen(): Promise<void> {
    application.stop();
    await open();
  }

  /** Turns the screen to portrait or landscape, as the system tells the page. */
  function turn(toPortrait: boolean): void {
    isPortrait = toPortrait;
    window.dispatchEvent(new CustomEvent("system:orientation"));
  }

  function press(init: KeyboardEventInit): void {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    isPortrait = false;
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(orientation: portrait)" && isPortrait,
        }) as MediaQueryList,
    );
  });

  afterEach(() => {
    application.stop();
    vi.restoreAllMocks();
  });

  // @behavior IF-046
  it("docks the list beside a landscape window", async () => {
    await open();

    expect(isDocked()).toBe(true);
  });

  // @behavior IF-047
  it("leaves the list undocked in a portrait window", async () => {
    isPortrait = true;

    await open();

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-048
  it("undocks the list when its button is pressed", async () => {
    await open();

    document.querySelector<HTMLElement>("#dock")!.click();

    expect(isDocked()).toBe(false);
  });

  it("marks its button pressed once the list is folded away, as the Preview's folds are", async () => {
    await open();

    document.querySelector<HTMLElement>("#dock")!.click();

    expect(document.querySelector("#dock")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  // @behavior IF-049
  it("docks the list with ⌘B on macOS", async () => {
    isPortrait = true;
    await open();

    press({ key: "b", metaKey: true });

    expect(isDocked()).toBe(true);
  });

  it("docks the list with Ctrl+B on other platforms", async () => {
    isPortrait = true;
    await open({ platform: "windows" });

    press({ key: "b", ctrlKey: true });

    expect(isDocked()).toBe(true);
  });

  it("leaves Ctrl+B to the text on macOS", async () => {
    isPortrait = true;
    await open();

    press({ key: "b", ctrlKey: true });

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-050
  it("keeps the list undocked for the next time a landscape window opens", async () => {
    await open();
    document.querySelector<HTMLElement>("#dock")!.click();

    await reopen();

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-051
  it("keeps each orientation's choice as the screen turns", async () => {
    await open();
    document.querySelector<HTMLElement>("#dock")!.click();
    turn(true);

    turn(false);

    expect(isDocked()).toBe(false);
  });

  it("follows the portrait default as the screen turns upright", async () => {
    await open();

    turn(true);

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-052
  it("lays the list over the editor with ⌘B in a narrow window", async () => {
    await open({ isNarrow: true });

    press({ key: "b", metaKey: true });

    expect([toggle().checked, isDocked()]).toEqual([true, true]);
  });
});
