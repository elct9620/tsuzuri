import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { t } from "../i18n";

interface ComponentStatus {
  name: string;
  ready: boolean;
  path: string | null;
  origin: "chosen" | "detected" | "bundled" | null;
  problem: "not-installed" | "does-not-run" | null;
  /** The command that installs it, where the platform has one to name. */
  install: string | null;
}

function statusMessage({
  ready,
  path,
  origin,
  problem,
  install,
}: ComponentStatus): string {
  if (ready && path)
    return t("components.found", {
      origin: t(`components.${origin ?? "ready"}`),
      path,
    });
  if (problem === "does-not-run") return t("components.doesNotRun");
  return install
    ? t("components.installWith", { command: install })
    : t("components.install");
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
      const status = this.statusByName(component.name);
      if (status) status.textContent = statusMessage(component);
    }
  }

  private statusByName(name: string): HTMLElement | undefined {
    return this.statusTargets.find(
      (status) => status.dataset.component === name,
    );
  }
}
