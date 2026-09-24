import { Controller } from "@hotwired/stimulus";

export default class TabsController extends Controller {
  static targets = ["tab", "panel"];

  declare readonly tabTargets: HTMLElement[];
  declare readonly panelTargets: HTMLElement[];

  select(event: Event): void {
    this.show((event.currentTarget as HTMLElement).dataset.tab);
  }

  /** A Mode's result is corrected on the Edit tab, so finished work moves there. */
  showEdit(): void {
    this.show("edit");
  }

  /** An opened SRT file is ready to translate. */
  showTranslate(): void {
    this.show("translate");
  }

  private show(tab: string | undefined): void {
    for (const target of this.tabTargets) {
      target.setAttribute("aria-selected", String(target.dataset.tab === tab));
    }
    for (const panel of this.panelTargets) {
      panel.hidden = panel.dataset.tab !== tab;
    }
  }
}
