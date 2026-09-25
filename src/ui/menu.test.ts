// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closeMenu } from "./menu";

describe("closeMenu", () => {
  // @behavior IF-006
  it("moves focus out of the menu an item was chosen from", () => {
    document.body.innerHTML = `
      <div class="dropdown">
        <div tabindex="0" role="button">開啟</div>
        <ul tabindex="-1" class="dropdown-content menu">
          <li><button type="button">開啟目錄</button></li>
        </ul>
      </div>
    `;
    const item = document.querySelector("button")!;
    item.focus();

    closeMenu(item);

    expect(
      document.querySelector(".dropdown")!.contains(document.activeElement),
    ).toBe(false);
  });
});
