// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SponsorshipController from "./sponsorship_controller";

describe("SponsorshipController", () => {
  let application: Application;
  let commands: string[];

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    commands = [];
    document.body.innerHTML = `
      <fieldset>
        <button data-controller="sponsorship" data-action="sponsorship#open">贊助</button>
      </fieldset>
    `;
    mockIPC((command) => {
      commands.push(command);
    });
    application = Application.start();
    application.register("sponsorship", SponsorshipController);
    await settle();
  });

  afterEach(() => {
    application.stop();
    clearMocks();
  });

  // @behavior IF-042
  it("opens where Tsuzuri can be sponsored", async () => {
    document.querySelector("button")!.click();
    await settle();

    expect(commands).toContain("open_sponsorship");
  });
});
