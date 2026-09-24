import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ComponentStatus {
  name: string;
  ready: boolean;
  path: string | null;
  origin: "chosen" | "detected" | "bundled" | null;
  hint: string | null;
}

const ORIGIN_LABELS: Record<string, string> = {
  chosen: "指定",
  detected: "偵測到",
  bundled: "內建",
};

export default class ComponentsController extends Controller {
  static targets = ["status"];

  declare readonly statusTargets: HTMLElement[];

  async connect(): Promise<void> {
    this.render(await invoke<ComponentStatus[]>("component_statuses"));
  }

  async choose(event: Event): Promise<void> {
    const name = (event.currentTarget as HTMLElement).dataset.component;
    const path = await open({ multiple: false, directory: false });
    if (!name || path === null) return;

    this.render(await invoke<ComponentStatus[]>("choose_component", { name, path }));
  }

  private render(statuses: ComponentStatus[]): void {
    for (const { name, ready, path, origin, hint } of statuses) {
      const status = this.statusFor(name);
      if (!status) continue;
      status.textContent =
        ready && path ? `${ORIGIN_LABELS[origin ?? ""] ?? "已就緒"}：${path}` : hint ? `未就緒（${hint}）` : "未就緒";
    }
  }

  private statusFor(name: string): HTMLElement | undefined {
    return this.statusTargets.find((status) => status.dataset.component === name);
  }
}
