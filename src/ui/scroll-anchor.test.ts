// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { anchoredScrollTop, scrollingAncestor } from "#/ui/scroll-anchor.ts";

describe("anchoredScrollTop", () => {
  it("scrolls up by as much as a row above folded up", () => {
    expect(anchoredScrollTop(300, 240, 200)).toBe(260);
  });

  it("scrolls down by as much as a row above unfolded", () => {
    expect(anchoredScrollTop(300, 200, 240)).toBe(340);
  });

  it("leaves the scroll where it is when nothing above moved", () => {
    expect(anchoredScrollTop(300, 200, 200)).toBe(300);
  });
});

describe("scrollingAncestor", () => {
  it("finds the nearest ancestor scrolling vertically", () => {
    document.body.innerHTML = `
      <div style="overflow-y: auto" id="outer">
        <div style="overflow-y: scroll" id="inner"><ol><li></li></ol></div>
      </div>`;

    const found = scrollingAncestor(document.querySelector("li")!);

    expect(found?.id).toBe("inner");
  });

  it("finds none where no ancestor scrolls", () => {
    document.body.innerHTML = `<div><ol><li></li></ol></div>`;

    expect(scrollingAncestor(document.querySelector("li")!)).toBeNull();
  });
});
