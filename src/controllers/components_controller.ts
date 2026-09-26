import { Controller } from "@hotwired/stimulus";
import { open } from "../backend/dialog";
import {
  chooseComponent,
  componentStatuses,
  forgetComponent,
  type ComponentStatus,
  type Origin,
} from "../backend/toolchain";
import { t } from "../i18n";

const ORIGIN_LABELS: Record<Origin, string> = {
  choice: "components.choice",
  detection: "components.detection",
  "bundled-variant": "components.bundled",
};

function statusMessage({
  is_ready,
  path,
  origin,
  variant,
  problem,
  install,
}: ComponentStatus): string {
  if (is_ready && path)
    return t("components.found", {
      origin: variant
        ? t("components.bundledVariant", { variant })
        : t(origin ? ORIGIN_LABELS[origin] : "components.ready"),
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
    this.show(await componentStatuses());
  }

  async choose(event: Event): Promise<void> {
    const name = (event.currentTarget as HTMLElement).dataset.component;
    const path = await open({ multiple: false, directory: false });
    if (!name || path === null) return;

    this.show(await chooseComponent(name, path));
  }

  async restore(event: Event): Promise<void> {
    const name = (event.currentTarget as HTMLElement).dataset.component;
    if (!name) return;

    this.show(await forgetComponent(name));
  }

  private show(statuses: ComponentStatus[]): void {
    for (const placeholder of this.placeholderTargets)
      placeholder.hidden = true;
    for (const component of statuses) {
      const status = this.targetByName(this.statusTargets, component.name);
      if (status) {
        status.textContent = statusMessage(component);
        status.hidden = false;
      }
      const restore = this.targetByName(this.restoreTargets, component.name);
      if (restore) restore.hidden = component.origin !== "choice";
    }
  }

  private targetByName(
    targets: HTMLElement[],
    name: string,
  ): HTMLElement | undefined {
    return targets.find((target) => target.dataset.component === name);
  }
}
