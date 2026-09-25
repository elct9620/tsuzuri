import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { t } from "../i18n";

interface ComponentStatus {
  name: string;
  ready: boolean;
  path: string | null;
  origin: "chosen" | "detected" | "bundled" | null;
  variant: string | null;
  problem: "not-installed" | "does-not-run" | null;
  /** The command that installs it, where the platform has one to name. */
  install: string | null;
}

function statusMessage({
  ready,
  path,
  origin,
  variant,
  problem,
  install,
}: ComponentStatus): string {
  if (ready && path)
    return t("components.found", {
      origin: variant
        ? t("components.bundledVariant", { variant })
        : t(`components.${origin ?? "ready"}`),
      path,
    });
  if (problem === "does-not-run") return t("components.doesNotRun");
  return install
    ? t("components.installWith", { command: install })
    : t("components.install");
}

export default class ComponentsController extends Controller {
  static targets = ["status", "restore", "placeholder"];

  declare readonly statusTargets: HTMLElement[];
  declare readonly restoreTargets: HTMLElement[];
  /** Stand in for the statuses until they are found. */
  declare readonly placeholderTargets: HTMLElement[];

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

  async restore(event: Event): Promise<void> {
    const name = (event.currentTarget as HTMLElement).dataset.component;
    if (!name) return;

    this.render(await invoke<ComponentStatus[]>("forget_component", { name }));
  }

  private render(statuses: ComponentStatus[]): void {
    for (const placeholder of this.placeholderTargets)
      placeholder.hidden = true;
    for (const component of statuses) {
      const status = this.targetByName(this.statusTargets, component.name);
      if (status) {
        status.textContent = statusMessage(component);
        status.hidden = false;
      }
      const restore = this.targetByName(this.restoreTargets, component.name);
      if (restore) restore.hidden = component.origin !== "chosen";
    }
  }

  private targetByName(
    targets: HTMLElement[],
    name: string,
  ): HTMLElement | undefined {
    return targets.find((target) => target.dataset.component === name);
  }
}
