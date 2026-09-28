// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutController from "./about_controller";
import { NOTIFICATION_STACK, notifications } from "../ui/test_notification";

describe("AboutController", () => {
  let application: Application;
  let commands: string[];
  let build: Record<string, unknown>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = <T extends HTMLElement>(name: string) =>
    document.querySelector<T>(`[data-about-target="${name}"]`)!;

  async function choose(action: string): Promise<void> {
    document
      .querySelector<HTMLButtonElement>(`[data-action="about#${action}"]`)!
      .click();
    await settle();
    await settle();
  }

  /** Opens the settings, which read the App Build as they connect. */
  async function openSettings(): Promise<void> {
    application = Application.start();
    application.register("about", AboutController);
    await settle();
  }

  beforeEach(async () => {
    commands = [];
    build = {
      release_number: "0.1.0",
      preview: null,
      has_preview_channel: true,
      commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    };
    document.body.innerHTML = `
      ${NOTIFICATION_STACK}
      <fieldset data-controller="about">
        <span data-about-target="build"></span>
        <button data-action="about#copyBuild">複製</button>
      </fieldset>
    `;
    mockIPC((command) => {
      commands.push(command);
      if (command === "app_build") return build;
    });
    await openSettings();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior OB-014
  it("shows the release number and the short commit in the settings", () => {
    expect(target("build").textContent).toBe("版本 0.1.0（a1b2c3d）");
  });

  // @behavior OB-015
  it("copies the App Build for a report", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await choose("copyBuild");

    expect([writeText.mock.calls, notifications()]).toEqual([
      [["Tsuzuri 0.1.0 (a1b2c3d)"]],
      ["已複製版本資訊"],
    ]);
  });

  // @behavior UP-031
  it("names a Preview build by the release it is based on and its build time", async () => {
    application.stop();
    build = {
      ...build,
      release_number: "0.2.1-preview.202609281430+12",
      preview: { based_on: "0.2.0", built_at: "20260928T143000Z" },
    };
    await openSettings();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await choose("copyBuild");

    expect([target("build").textContent, writeText.mock.calls]).toEqual([
      `預覽版｜以 0.2.0 為基礎｜2026-09-28 22:30 建置（a1b2c3d）`,
      [["Tsuzuri 0.2.1-preview.202609281430+12 (a1b2c3d)"]],
    ]);
  });
});
