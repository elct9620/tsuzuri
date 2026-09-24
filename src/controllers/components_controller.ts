import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface ComponentStatus {
  name: string;
  ready: boolean;
  hint: string | null;
}

interface Progress {
  name: string;
  downloaded: number;
  total: number | null;
}

export default class ComponentsController extends Controller {
  static targets = ["status"];

  declare readonly statusTargets: HTMLElement[];

  private unlisten?: UnlistenFn;

  async connect(): Promise<void> {
    this.unlisten = await listen<Progress>("component-progress", (event) => this.showProgress(event.payload));

    const statuses = await invoke<ComponentStatus[]>("component_statuses");
    this.render(statuses);
    const pending = statuses.filter((status) => !status.ready && status.hint === null);
    if (pending.length === 0) return;
    try {
      this.render(await invoke<ComponentStatus[]>("install_components"));
    } catch {
      for (const { name } of pending) {
        const status = this.statusFor(name);
        if (status) status.textContent = "下載失敗，重新開啟 App 會續傳";
      }
    }
  }

  disconnect(): void {
    this.unlisten?.();
  }

  private render(statuses: ComponentStatus[]): void {
    for (const { name, ready, hint } of statuses) {
      const status = this.statusFor(name);
      if (!status) continue;
      status.textContent = ready ? "已就緒" : hint ? `未建置（${hint}）` : "未安裝";
    }
  }

  private showProgress({ name, downloaded, total }: Progress): void {
    const status = this.statusFor(name);
    if (!status) return;
    status.textContent =
      total === null
        ? `下載中 ${(downloaded / 1_048_576).toFixed(0)} MB`
        : `下載中 ${Math.floor((downloaded / total) * 100)}%`;
  }

  private statusFor(name: string): HTMLElement | undefined {
    return this.statusTargets.find((status) => status.dataset.component === name);
  }
}
