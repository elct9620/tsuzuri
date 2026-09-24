import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ComponentStatus {
  name: string;
  ready: boolean;
  path: string | null;
  origin: "chosen" | "detected" | "bundled" | null;
  problem: "not-installed" | "does-not-run" | null;
  /** The command that installs it, where the platform has one to name. */
  install: string | null;
}

const ORIGIN_LABELS: Record<string, string> = {
  chosen: "指定",
  detected: "偵測到",
  bundled: "內建",
};

function describe({
  ready,
  path,
  origin,
  problem,
  install,
}: ComponentStatus): string {
  if (ready && path)
    return `${ORIGIN_LABELS[origin ?? ""] ?? "已就緒"}：${path}`;
  if (problem === "does-not-run")
    return "未就緒（內建的版本無法執行，可能缺少驅動程式或系統函式庫）";
  return install
    ? `未就緒（可用 ${install} 安裝）`
    : "未就緒（請用套件管理工具安裝）";
}

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

    this.render(
      await invoke<ComponentStatus[]>("choose_component", { name, path }),
    );
  }

  private render(statuses: ComponentStatus[]): void {
    for (const component of statuses) {
      const status = this.statusFor(component.name);
      if (status) status.textContent = describe(component);
    }
  }

  private statusFor(name: string): HTMLElement | undefined {
    return this.statusTargets.find(
      (status) => status.dataset.component === name,
    );
  }
}
