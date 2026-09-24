import { Controller } from "@hotwired/stimulus";

export default class ModeTabsController extends Controller {
  static targets = ["tab", "panel"];

  declare readonly tabTargets: HTMLElement[];
  declare readonly panelTargets: HTMLElement[];

  select(event: Event): void {
    const mode = (event.currentTarget as HTMLElement).dataset.mode;
    for (const tab of this.tabTargets) {
      tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    }
    for (const panel of this.panelTargets) {
      panel.hidden = panel.dataset.mode !== mode;
    }
  }
}
