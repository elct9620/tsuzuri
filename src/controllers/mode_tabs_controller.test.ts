// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ModeTabsController from "./mode_tabs_controller";

describe("ModeTabsController", () => {
  let application: Application;

  beforeEach(async () => {
    document.body.innerHTML = `
      <section data-controller="mode-tabs">
        <button data-mode="transcribe" aria-selected="true" data-mode-tabs-target="tab" data-action="mode-tabs#select">轉錄</button>
        <button data-mode="translate" aria-selected="false" data-mode-tabs-target="tab" data-action="mode-tabs#select">翻譯</button>
        <div data-mode="transcribe" data-mode-tabs-target="panel">A</div>
        <div data-mode="translate" data-mode-tabs-target="panel" hidden>B</div>
      </section>
    `;
    application = Application.start();
    application.register("mode-tabs", ModeTabsController);
    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
  });

  it("shows only the panel of the selected mode", () => {
    document.querySelector<HTMLElement>('[data-mode-tabs-target="tab"][data-mode="translate"]')!.click();

    const visible = [...document.querySelectorAll<HTMLElement>('[data-mode-tabs-target="panel"]')]
      .filter((panel) => !panel.hidden)
      .map((panel) => panel.dataset.mode);
    expect(visible).toEqual(["translate"]);
  });

  it("marks only the clicked tab as selected", () => {
    document.querySelector<HTMLElement>('[data-mode-tabs-target="tab"][data-mode="translate"]')!.click();

    const selected = [...document.querySelectorAll<HTMLElement>('[data-mode-tabs-target="tab"]')]
      .filter((tab) => tab.getAttribute("aria-selected") === "true")
      .map((tab) => tab.dataset.mode);
    expect(selected).toEqual(["translate"]);
  });
});
