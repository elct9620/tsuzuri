// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TabsController from "./tabs_controller";

describe("TabsController", () => {
  let application: Application;

  beforeEach(async () => {
    document.body.innerHTML = `
      <section data-controller="tabs">
        <button data-tab="transcribe" aria-selected="true" data-tabs-target="tab" data-action="tabs#select">轉錄</button>
        <button data-tab="translate" aria-selected="false" data-tabs-target="tab" data-action="tabs#select">翻譯</button>
        <div data-tab="transcribe" data-tabs-target="panel">A</div>
        <div data-tab="translate" data-tabs-target="panel" hidden>B</div>
      </section>
    `;
    application = Application.start();
    application.register("tabs", TabsController);
    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
  });

  it("shows only the panel of the selected tab", () => {
    document
      .querySelector<HTMLElement>(
        '[data-tabs-target="tab"][data-tab="translate"]',
      )!
      .click();

    const visible = [
      ...document.querySelectorAll<HTMLElement>('[data-tabs-target="panel"]'),
    ]
      .filter((panel) => !panel.hidden)
      .map((panel) => panel.dataset.tab);
    expect(visible).toEqual(["translate"]);
  });

  it("marks only the clicked tab as selected", () => {
    document
      .querySelector<HTMLElement>(
        '[data-tabs-target="tab"][data-tab="translate"]',
      )!
      .click();

    const selected = [
      ...document.querySelectorAll<HTMLElement>('[data-tabs-target="tab"]'),
    ]
      .filter((tab) => tab.getAttribute("aria-selected") === "true")
      .map((tab) => tab.dataset.tab);
    expect(selected).toEqual(["translate"]);
  });
});
