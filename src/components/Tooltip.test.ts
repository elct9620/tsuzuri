// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";
import { topLayer } from "#/test-top-layer.ts";
import Tooltip from "#/components/Tooltip.svelte";

describe("Tooltip", () => {
  const bubble = () =>
    document.querySelector<HTMLElement>(".tooltip[popover]")!;
  const isShown = () => topLayer().includes(bubble());
  /** The text the tooltip shows, as drawn now. */
  function tip(): string | undefined {
    flushSync();
    return bubble().dataset.tip;
  }

  function point(event: string, selector: string): void {
    document
      .querySelector(selector)!
      .dispatchEvent(new Event(event, { bubbles: true }));
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <ul><li><button id="resource" data-tooltip="ep03-a-very-long-name">ep03…</button></li></ul>
      <button id="following" data-tooltip="清單會捲到正在播放的段落" data-shortcut="following"></button>
      <button id="replace" data-shortcut="replace">取代</button>
      <dialog>
        <span id="setting" data-tooltip="每批送給模型的句數">每批</span>
        <button id="help" type="button" data-tooltip="一次送給模型幾句">ⓘ</button>
      </dialog>
    `;
    render(Tooltip);
  });

  // @behavior IF-009
  it("shows the text of the element the pointer is on", () => {
    point("pointerover", "#resource");

    expect([isShown(), tip()]).toEqual([true, "ep03-a-very-long-name"]);
  });

  // @behavior IF-010
  it("hides the tooltip once the pointer leaves", () => {
    point("pointerover", "#resource");

    point("pointerout", "#resource");

    expect(isShown()).toBe(false);
  });

  // @behavior IF-053
  it("shows the text of the element focus moves onto", () => {
    document.querySelector("dialog")!.showModal();

    document.querySelector<HTMLButtonElement>("#help")!.focus();

    expect([isShown(), tip()]).toEqual([true, "一次送給模型幾句"]);
  });

  // @behavior IF-011
  it("shows the tooltip of an element in a dialog above that dialog", () => {
    point("pointerover", "#resource");
    document.querySelector("dialog")!.showModal();

    point("pointerover", "#setting");

    expect(topLayer().slice(-1)).toEqual([bubble()]);
  });

  // @behavior IF-035
  it("ends the tooltip of a button with its shortcut", () => {
    point("pointerover", "#following");

    expect(tip()).toBe("清單會捲到正在播放的段落（Ctrl+L）");
  });

  it("shows the shortcut alone for a button that explains nothing more", () => {
    point("pointerover", "#replace");

    expect(tip()).toBe("Ctrl+H");
  });

  // @behavior IF-027
  it("hides the tooltip while a list scrolls", () => {
    point("pointerover", "#resource");

    document.querySelector("ul")!.dispatchEvent(new Event("scroll"));

    expect(isShown()).toBe(false);
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
    flushSync();

    expect([
      bubble().classList.contains("tooltip-left"),
      bubble().classList.contains("tooltip-right"),
    ]).toEqual([true, false]);
  });
});
