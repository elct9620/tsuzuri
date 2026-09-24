// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ComponentsController from "./components_controller";

describe("ComponentsController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function mountWith(handlers: Record<string, (args?: unknown) => unknown>): Promise<void> {
    mockIPC((command, args) => handlers[command]?.(args), { shouldMockEvents: true });
    application = Application.start();
    application.register("components", ComponentsController);
    await settle();
  }

  function statusOf(name: string): string {
    return document.querySelector(`[data-components-target="status"][data-component="${name}"]`)!.textContent!;
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

  // @behavior CP-006
  it("shows the downloaded percentage of a component", async () => {
    await mountWith({
      component_statuses: () => [{ name: "llama", ready: false, path: null, origin: null, hint: null }],
      install_components: () => new Promise(() => {}),
    });

    await emit("component-progress", { name: "llama", downloaded: 50, total: 200 });
    await settle();

    expect(statusOf("llama")).toBe("下載中 25%");
  });

  // @behavior CP-008
  it("says a failed download resumes on the next launch", async () => {
    await mountWith({
      component_statuses: () => [{ name: "llama", ready: false, path: null, origin: null, hint: null }],
      install_components: () => Promise.reject("network down"),
    });

    expect(statusOf("llama")).toContain("重新開啟 App 會續傳");
  });

  // @behavior CP-007
  it("shows a component whose executable is in place as ready", async () => {
    await mountWith({
      component_statuses: () => [
        { name: "llama", ready: true, path: "/components/llama-server", origin: "downloaded", hint: null },
      ],
    });

    expect(statusOf("llama")).toBe("已下載：/components/llama-server");
  });

  // @behavior CP-013
  it("shows the path chosen for a component", async () => {
    await mountWith({
      component_statuses: () => [{ name: "llama", ready: true, path: "/usr/bin/llama-server", origin: "detected", hint: null }],
      "plugin:dialog|open": () => "/opt/llama/llama-server",
      choose_component: (args) => {
        const { name, path } = args as { name: string; path: string };
        return [{ name, ready: true, path, origin: "chosen", hint: null }];
      },
    });

    document.querySelector<HTMLButtonElement>("button")!.click();
    await settle();

    expect(statusOf("llama")).toBe("指定：/opt/llama/llama-server");
  });
});
