// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VersionAndUpdates from "./VersionAndUpdates.svelte";
import {
  NOTIFICATION_STACK,
  notifications,
} from "../../../ui/test_notification";

describe("VersionAndUpdates", () => {
  let build: Record<string, unknown>;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const shownBuild = () => screen.getByText(/（[0-9a-f]{7}）$/).textContent;

  /** Opens the settings, which read the App Build as they are written. */
  async function openSettings(): Promise<void> {
    render(VersionAndUpdates);
    await settle();
  }

  async function copyBuild(): Promise<void> {
    screen.getByRole("button", { name: "複製" }).click();
    await settle();
    await settle();
  }

  beforeEach(async () => {
    build = {
      release_number: "0.1.0",
      release_name: "v0.1.0",
      is_preview_build: false,
      has_preview_channel: true,
      commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    };
    document.body.innerHTML = NOTIFICATION_STACK;
    mockIPC((command) => {
      if (command === "app_build") return build;
    });
  });

  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  // @behavior OB-014
  it("shows the Release Name and the short commit in the settings", async () => {
    await openSettings();

    expect(shownBuild()).toBe("v0.1.0（a1b2c3d）");
  });

  // @behavior OB-015
  it("copies the App Build for a report", async () => {
    await openSettings();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyBuild();

    expect([writeText.mock.calls, notifications()]).toEqual([
      [["Tsuzuri v0.1.0 (a1b2c3d)"]],
      ["已複製版本資訊"],
    ]);
  });

  // @behavior UP-031
  it("names a Preview build by its Release Name, never its release number", async () => {
    build = {
      ...build,
      release_number: "0.2.1-preview.202609281430+12",
      release_name: "Build 20260928+12",
      is_preview_build: true,
    };
    await openSettings();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyBuild();

    expect([shownBuild(), writeText.mock.calls]).toEqual([
      "Build 20260928+12（a1b2c3d）",
      [["Tsuzuri Build 20260928+12 (a1b2c3d)"]],
    ]);
  });
});
