// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TooltipController from "./tooltip_controller";

describe("TooltipController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const bubble = () =>
    document.querySelector<HTMLElement>('[data-tooltip-target="bubble"]')!;

  function point(event: string, selector: string): void {
    document
      .querySelector(selector)!
      .dispatchEvent(new Event(event, { bubbles: true }));
  }

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="tooltip" data-action="pointerover->tooltip#show focusin->tooltip#show pointerout->tooltip#hide focusout->tooltip#hide scroll->tooltip#hide:capture">
        <ul><li><button id="resource" data-tooltip="ep03-a-very-long-name">ep03…</button></li></ul>
        <dialog open>
          <span id="setting" data-tooltip="每批送給模型的句數">每批</span>
        </dialog>
        <div class="tooltip tooltip-open fixed" data-tooltip-target="bubble" hidden></div>
      </div>
    `;
    application = Application.start();
    application.register("tooltip", TooltipController);
    await settle();
  });

  afterEach(() => {
    application.stop();
  });

  // @behavior IF-009
  it("shows the text of the element the pointer is on", () => {
    point("pointerover", "#resource");

    expect([bubble().hidden, bubble().dataset.tip]).toEqual([
      false,
      "ep03-a-very-long-name",
    ]);
  });

  // @behavior IF-010
  it("hides the tooltip once the pointer leaves", () => {
    point("pointerover", "#resource");

    point("pointerout", "#resource");

    expect(bubble().hidden).toBe(true);
  });

  // @behavior IF-011
  it("shows the tooltip of an element in a dialog inside that dialog", () => {
    point("pointerover", "#setting");

    expect(bubble().parentElement).toBe(document.querySelector("dialog"));
  });

  // @behavior IF-027
  it("hides the tooltip while a list scrolls", () => {
    point("pointerover", "#resource");

    document.querySelector("ul")!.dispatchEvent(new Event("scroll"));

    expect(bubble().hidden).toBe(true);
  });

  // @behavior IF-029
  it("opens the tooltip to the left of an element in the right half of the window", () => {
    const zoom = document.querySelector<HTMLElement>("#resource")!;
    zoom.getBoundingClientRect = () =>
      DOMRect.fromRect({
        x: window.innerWidth - 40,
        y: 10,
        width: 24,
        height: 24,
      });

    point("pointerover", "#resource");

    expect([
      bubble().classList.contains("tooltip-left"),
      bubble().classList.contains("tooltip-right"),
    ]).toEqual([true, false]);
  });
});
