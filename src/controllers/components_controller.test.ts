// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ComponentsController from "./components_controller";

describe("ComponentsController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function mountWith(
    handlers: Record<string, (args?: unknown) => unknown>,
  ): Promise<void> {
    mockIPC((command, args) => handlers[command]?.(args), {
      shouldMockEvents: true,
    });
    application = Application.start();
    application.register("components", ComponentsController);
    await settle();
  }

  function statusOf(name: string): string {
    return document.querySelector(
      `[data-components-target="status"][data-component="${name}"]`,
    )!.textContent!;
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <ul data-controller="components">
        <li>
          <span data-components-target="status" data-component="llama"></span>
          <button data-component="llama" data-action="components#choose">指定</button>
        </li>
      </ul>
    `;
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior CP-007
  it("shows a component whose executable is in place as ready", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          ready: true,
          path: "/components/llama/bin/llama-server",
          origin: "bundled",
          variant: null,
          problem: null,
          install: null,
        },
      ],
    });

    expect(statusOf("llama")).toBe("內建：/components/llama/bin/llama-server");
  });

  // @behavior CP-019
  it("names the variant a bundled component was selected as", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          ready: true,
          path: "/components/llama/vulkan/bin/llama-server",
          origin: "bundled",
          variant: "vulkan",
          problem: null,
          install: null,
        },
      ],
    });

    expect(statusOf("llama")).toBe(
      "內建（vulkan）：/components/llama/vulkan/bin/llama-server",
    );
  });

  // @behavior CP-014
  it("says why a component is not ready", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          ready: false,
          path: null,
          origin: null,
          variant: null,
          problem: "does-not-run",
          install: null,
        },
      ],
    });

    expect(statusOf("llama")).toBe(
      "未就緒（內建的版本無法執行，可能缺少驅動程式或系統函式庫）",
    );
  });

  // @behavior CP-005
  it("says how to install a component that cannot be found", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          ready: false,
          path: null,
          origin: null,
          variant: null,
          problem: "not-installed",
          install: "brew install llama.cpp",
        },
      ],
    });

    expect(statusOf("llama")).toBe(
      "未就緒（可用 brew install llama.cpp 安裝）",
    );
  });

  // @behavior CP-013
  it("shows the path chosen for a component", async () => {
    await mountWith({
      component_statuses: () => [
        {
          name: "llama",
          ready: true,
          path: "/usr/bin/llama-server",
          origin: "detected",
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
            ready: true,
            path,
            origin: "chosen",
            problem: null,
            install: null,
          },
        ];
      },
    });

    document.querySelector<HTMLButtonElement>("button")!.click();
    await settle();

    expect(statusOf("llama")).toBe("指定：/opt/llama/llama-server");
  });
});
