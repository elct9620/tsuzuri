import { Controller } from "@hotwired/stimulus";

export default class TabsController extends Controller {
  static targets = ["tab", "panel"];

  declare readonly tabTargets: HTMLElement[];
  declare readonly panelTargets: HTMLElement[];

  select(event: Event): void {
    const tab = (event.currentTarget as HTMLElement).dataset.tab;
    for (const target of this.tabTargets) {
      target.setAttribute("aria-selected", String(target.dataset.tab === tab));
    }
    for (const panel of this.panelTargets) {
      panel.hidden = panel.dataset.tab !== tab;
    }
  }
}
