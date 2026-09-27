// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutController from "./about_controller";

describe("AboutController", () => {
  let application: Application;
  let commands: string[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-about-target="${name}"]`)!;

  /** Serves `page` wherever the interface asks for LICENSE.html. */
  function servePage(page: string): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(page, { status: 200 })),
    );
  }

  async function choose(action: string): Promise<void> {
    document
      .querySelector<HTMLButtonElement>(`[data-action="about#${action}"]`)!
      .click();
    await settle();
    await settle();
  }

  beforeEach(async () => {
    commands = [];
    document.body.innerHTML = `
      <fieldset data-controller="about">
        <button data-action="about#showLicenses">完整授權</button>
        <button data-action="about#openSource">原始程式碼</button>
        <dialog data-about-target="dialog">
          <iframe data-about-target="notice" hidden></iframe>
          <div data-about-target="missingHint" hidden></div>
        </dialog>
      </fieldset>
    `;
    mockIPC((command) => {
      commands.push(command);
    });
    application = Application.start();
    application.register("about", AboutController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior LC-007
  it("opens the License Notice from the settings", async () => {
    servePage(
      `<!DOCTYPE html><body><section id="tsuzuri"><pre>Apache License</pre></section></body>`,
    );

    await choose("showLicenses");

    expect(target<HTMLDialogElement>("dialog").open).toBe(true);
    expect(target<HTMLIFrameElement>("notice").hidden).toBe(false);
    expect(target<HTMLIFrameElement>("notice").srcdoc).toContain(
      "Apache License",
    );
    expect(target("missingHint").hidden).toBe(true);
  });

  // @behavior LC-008
  it("says a development build carries no License Notice", async () => {
    servePage(
      `<!DOCTYPE html><body><main data-controller="project"></main></body>`,
    );

    await choose("showLicenses");

    expect(target<HTMLDialogElement>("dialog").open).toBe(true);
    expect(target("missingHint").hidden).toBe(false);
    expect(target<HTMLIFrameElement>("notice").hidden).toBe(true);
  });

  // @behavior LC-009
  it("opens where the source of the bundled ffmpeg is", async () => {
    await choose("openSource");

    expect(commands).toEqual(["open_releases"]);
  });
});
