// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/svelte";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Components from "#/components/settings/general/Components.svelte";
import { showNotifications, notifications } from "#/testing/notifications.ts";
import { settle } from "#/testing/settle.ts";

describe("Components", () => {
  /** The row of llama.cpp, which every case here looks at. */
  const llamaRow = () => screen.getByText("llama.cpp").closest("li")!;

  /** Opens the settings, which find the Components as they are written. */
  async function mountWith(
    handlers: Record<string, (args?: unknown) => unknown>,
  ): Promise<void> {
    mockIPC((command, args) => handlers[command]?.(args));
    render(Components);
    await settle();
  }

  /** The status the row shows, or null while none is shown. */
  function llamaStatus(): string | null {
    return (
      within(llamaRow()).queryByText(/.+/, {
        selector: "li > span",
      })?.textContent ?? null
    );
  }

  function restoreButton(): HTMLButtonElement | null {
    return within(llamaRow()).queryByRole("button", { name: "還原預設值" });
  }

  beforeEach(() => {
    showNotifications();
  });

  afterEach(() => {
    clearMocks();
  });

  // @behavior CP-007
  it("shows a component whose executable is in place as ready", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/components/llama/bin/llama-server",
          origin: "bundled-variant",
          variant: null,
          problem: null,
          install: null,
        },
      ],
    });

    expect(llamaStatus()).toBe("內建：/components/llama/bin/llama-server");
  });

  // @behavior CP-019
  it("names the variant a bundled component was selected as", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/components/llama/vulkan/bin/llama-server",
          origin: "bundled-variant",
          variant: "vulkan",
          problem: null,
          install: null,
        },
      ],
    });

    expect(llamaStatus()).toBe(
      "內建（vulkan）：/components/llama/vulkan/bin/llama-server",
    );
  });

  // @behavior CP-014
  it("says why a component is not ready", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: false,
          path: null,
          origin: null,
          variant: null,
          problem: "does-not-run",
          install: null,
        },
      ],
    });

    expect(llamaStatus()).toBe(
      "未就緒（內建的版本無法執行，可能缺少驅動程式或系統函式庫）",
    );
  });

  // @behavior CP-005
  it("says how to install a component that cannot be found", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: false,
          path: null,
          origin: null,
          variant: null,
          problem: "not-installed",
          install: "brew install llama.cpp",
        },
      ],
    });

    expect(llamaStatus()).toBe("未就緒（可用 brew install llama.cpp 安裝）");
  });

  // @behavior CP-013
  it("shows the path chosen for a component", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/usr/bin/llama-server",
          origin: "detection",
          variant: null,
          problem: null,
          install: null,
        },
      ],
      "plugin:dialog|open": () => "/opt/llama/llama-server",
      choose_component: (args) => {
        const { name, path } = args as { name: string; path: string };
        return [
          {
            name,
            is_ready: true,
            path,
            origin: "choice",
            problem: null,
            install: null,
          },
        ];
      },
    });

    within(llamaRow()).getByRole("button", { name: "指定" }).click();
    await settle();

    expect(llamaStatus()).toBe("指定：/opt/llama/llama-server");
  });

  // @behavior CP-021
  it("shows where a component is found once its default is restored", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/opt/llama/llama-server",
          origin: "choice",
          variant: null,
          problem: null,
          install: null,
        },
      ],
      forget_component: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/usr/bin/llama-server",
          origin: "detection",
          variant: null,
          problem: null,
          install: null,
        },
      ],
    });

    restoreButton()!.click();
    await settle();

    expect(llamaStatus()).toBe("偵測到：/usr/bin/llama-server");
  });

  // @behavior CP-022
  it("offers no restoring for a component found by detection", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/usr/bin/llama-server",
          origin: "detection",
          variant: null,
          problem: null,
          install: null,
        },
      ],
    });

    expect(restoreButton()).toBeNull();
  });

  // @behavior CP-023
  it("shows a Placeholder while the statuses are still being found", async () => {
    await mountWith({ component_statuses: () => new Promise(() => {}) });

    expect([
      llamaRow().querySelector(".skeleton") !== null,
      llamaStatus(),
    ]).toEqual([true, null]);
  });

  // @behavior CP-027
  it("shows the status in place of the Placeholder once it is found", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/usr/bin/llama-server",
          origin: "detection",
          variant: null,
          problem: null,
          install: null,
        },
      ],
    });

    expect([llamaRow().querySelector(".skeleton"), llamaStatus()]).toEqual([
      null,
      "偵測到：/usr/bin/llama-server",
    ]);
  });

  // @behavior CP-024
  it("says the Components were not read", async () => {
    await mountWith({
      component_statuses: () => {
        throw { code: "io", detail: "denied" };
      },
    });

    expect(notifications()).toEqual(["讀不到設定"]);
  });

  // @behavior CP-025
  it("says a Component was not chosen when recording it fails", async () => {
    await mountWith({
      component_statuses: () => [],
      "plugin:dialog|open": () => "/usr/local/bin/llama-server",
      choose_component: () => {
        throw { code: "io", detail: "denied" };
      },
    });

    within(llamaRow()).getByRole("button", { name: "指定" }).click();
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });

  // @behavior CP-026
  it("says a Component was not restored when forgetting the choice fails", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          is_ready: true,
          path: "/opt/llama/llama-server",
          origin: "choice",
          variant: null,
          problem: null,
          install: null,
        },
      ],
      forget_component: () => {
        throw { code: "io", detail: "denied" };
      },
    });

    restoreButton()!.click();
    await settle();

    expect(notifications()).toEqual(["設定沒有儲存"]);
  });
});
