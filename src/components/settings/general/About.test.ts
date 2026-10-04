// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import About from "./About.svelte";

describe("About", () => {
  let commands: string[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = () =>
    screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  const notice = () => screen.queryByTitle<HTMLIFrameElement>("LICENSE.html");
  const missingHint = () =>
    screen.queryByText("開發版沒有附上完整授權，每個釋出的版本都會附上。");

  /** Serves `page` wherever the interface asks for LICENSE.html. */
  function servePage(page: string): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(page, { status: 200 })),
    );
  }

  async function choose(name: string): Promise<void> {
    screen.getByRole("button", { name }).click();
    await settle();
    await settle();
  }

  beforeEach(() => {
    commands = [];
    mockIPC((command) => {
      commands.push(command);
    });
    render(About);
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior LC-007
  it("opens the License Notice from the settings", async () => {
    servePage(
      `<!DOCTYPE html><body><section id="tsuzuri"><pre>Apache License</pre></section></body>`,
    );

    await choose("完整授權");

    expect([
      dialog().open,
      notice()?.srcdoc.includes("Apache License"),
      missingHint(),
    ]).toEqual([true, true, null]);
  });

  // @behavior LC-008
  it("says a development build carries no License Notice", async () => {
    servePage(
      `<!DOCTYPE html><body><main data-controller="project"></main></body>`,
    );

    await choose("完整授權");

    expect([dialog().open, missingHint() !== null, notice()]).toEqual([
      true,
      true,
      null,
    ]);
  });

  // @behavior LC-009
  it("opens where the source of the bundled ffmpeg is", async () => {
    await choose("原始程式碼");

    expect(commands).toContain("open_releases");
  });

  // @behavior IF-042
  it("opens where Tsuzuri can be sponsored", async () => {
    await choose("贊助");

    expect(commands).toContain("open_sponsorship");
  });
});
