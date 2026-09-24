import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

interface ComponentStatus {
  name: string;
  ready: boolean;
  path: string | null;
  origin: "chosen" | "detected" | "downloaded" | null;
  hint: string | null;
}

const ORIGIN_LABELS: Record<string, string> = {
  chosen: "指定",
  detected: "偵測到",
  downloaded: "已下載",
};

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
        ready && path ? `${ORIGIN_LABELS[origin ?? ""] ?? "已就緒"}：${path}` : hint ? `未安裝（${hint}）` : "未安裝";
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
