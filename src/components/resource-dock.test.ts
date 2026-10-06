// @vitest-environment happy-dom
import { within } from "@testing-library/svelte";
import { clearMocks } from "@tauri-apps/api/mocks";
import { flushSync, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editingPort } from "#/ipc/editing.ts";
import { ProjectFeed } from "#/ipc/project.ts";
import { EditingSession } from "#/editor/index.ts";
import { setInterfaceLanguage, t } from "#/i18n.ts";
import { drawPage } from "#/page.ts";
import { mockPageMount } from "#/test-page.ts";
import { projectOf, resourceOf } from "#/test-project.ts";

/**
 * Tailwind's rules for the toolbar's two buttons, which the page's stylesheet would give: the one
 * laying the list over the editor shows only below 1024px.
 */
const DRAWER_BUTTON_STYLES = `
  .hidden { display: none; }
  @media (width >= 64rem) {
    .lg\\:hidden { display: none; }
    .lg\\:inline-flex { display: inline-flex; }
  }
`;

const LANDSCAPE_WINDOW = { width: 1280, height: 800 };
const PORTRAIT_WINDOW = { width: 1100, height: 1400 };
const NARROW_WINDOW = { width: 800, height: 600 };

describe("ResourceDock", () => {
  let page: Record<string, unknown> | undefined;
  let feed: ProjectFeed;
  let selectedNames: string[];

  const drawer = () => document.querySelector<HTMLElement>(".drawer")!;
  const isDocked = () => drawer().hasAttribute("data-is-docked");
  const isOverlaid = () =>
    document.querySelector<HTMLInputElement>(".drawer-toggle")!.checked;
  const dockButton = () =>
    within(document.body).getByRole("button", {
      hidden: true,
      name: t("resources.dock"),
    });

  /** Sizes the window as `viewport`, which happy-dom only reads for what is drawn after it. */
  function holdWindow(viewport: { width: number; height: number }): void {
    (
      window as unknown as {
        happyDOM: { setViewport(size: typeof viewport): void };
      }
    ).happyDOM.setViewport(viewport);
    flushSync();
  }

  /** Opens the page in a window of `viewport` on `platform`. */
  async function open(
    viewport = LANDSCAPE_WINDOW,
    platform = "macos",
  ): Promise<void> {
    Object.assign(window, { __TAURI_OS_PLUGIN_INTERNALS__: { platform } });
    holdWindow(viewport);
    feed = new ProjectFeed();
    page = drawPage(feed, new EditingSession(editingPort));
    await tick();
  }

  /** Starts the page over, as the next time the app opens. */
  async function reopen(): Promise<void> {
    unmount(page!);
    document.body.replaceChildren();
    await open();
  }

  function press(init: KeyboardEventInit): void {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    flushSync();
  }

  function click(element: HTMLElement): void {
    element.click();
    flushSync();
  }

  beforeEach(async () => {
    localStorage.clear();
    await setInterfaceLanguage("zh-TW");
    document.head.innerHTML = `<style>${DRAWER_BUTTON_STYLES}</style>`;
    selectedNames = [];
    mockPageMount(
      projectOf({ resources: [resourceOf(), resourceOf({ name: "ep02" })] }),
      { select_resource: () => selectedNames.push("chosen") },
    );
  });

  afterEach(() => {
    if (page) unmount(page);
    page = undefined;
    document.body.replaceChildren();
    document.head.replaceChildren();
    clearMocks();
  });

  // @behavior IF-046
  it("docks the list beside a landscape window", async () => {
    await open();

    expect(isDocked()).toBe(true);
  });

  // @behavior IF-047
  it("leaves the list undocked in a portrait window", async () => {
    await open(PORTRAIT_WINDOW);

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-048
  it("undocks the list when its button is pressed", async () => {
    await open();

    click(dockButton());

    expect(isDocked()).toBe(false);
  });

  it("marks its button pressed once the list is folded away, as the Preview's folds are", async () => {
    await open();

    click(dockButton());

    expect([
      dockButton().getAttribute("aria-pressed"),
      dockButton().classList.contains("btn-primary"),
    ]).toEqual(["true", true]);
  });

  // @behavior IF-049
  it("docks the list with ⌘B on macOS", async () => {
    await open(PORTRAIT_WINDOW);

    press({ key: "b", metaKey: true });

    expect(isDocked()).toBe(true);
  });

  it("docks the list with Ctrl+B on other platforms", async () => {
    await open(PORTRAIT_WINDOW, "windows");

    press({ key: "b", ctrlKey: true });

    expect(isDocked()).toBe(true);
  });

  it("leaves Ctrl+B to the text on macOS", async () => {
    await open(PORTRAIT_WINDOW);

    press({ key: "b", ctrlKey: true });

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-050
  it("keeps the list undocked for the next time a landscape window opens", async () => {
    await open();
    click(dockButton());

    await reopen();

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-051
  it("keeps each orientation's choice as the screen turns", async () => {
    await open();
    click(dockButton());
    holdWindow(PORTRAIT_WINDOW);

    holdWindow(LANDSCAPE_WINDOW);

    expect(isDocked()).toBe(false);
  });

  it("follows the portrait default as the screen turns upright", async () => {
    await open();

    holdWindow(PORTRAIT_WINDOW);

    expect(isDocked()).toBe(false);
  });

  // @behavior IF-052
  it("lays the list over the editor with ⌘B in a narrow window", async () => {
    await open(NARROW_WINDOW);

    press({ key: "b", metaKey: true });

    expect([isOverlaid(), isDocked()]).toEqual([true, true]);
  });

  // @behavior PJ-183
  it("puts the Resource list away once a Resource is chosen", async () => {
    await open(NARROW_WINDOW);
    await feed.refresh();
    flushSync();
    press({ key: "b", metaKey: true });

    click(
      within(document.body).getByRole("button", { hidden: true, name: /ep02/ }),
    );

    expect([selectedNames, isOverlaid()]).toEqual([["chosen"], false]);
  });
});
