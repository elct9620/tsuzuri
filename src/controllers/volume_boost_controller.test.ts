// @vitest-environment happy-dom
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DialogController from "./dialog_controller";

describe("VolumeBoostController", () => {
  let application: Application;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const target = (name: string) =>
    document.querySelector<HTMLElement>(
      `[data-volume-boost-target="${name}"]`,
    )!;
  const toggle = () => target("toggle") as HTMLInputElement;

  /** A Web Audio context 30 ms ahead of the speakers, suspended until resumed. */
  class FakeAudioContext {
    state: AudioContextState = "suspended";
    readonly baseLatency = 0.01;
    readonly outputLatency = 0.02;
    readonly destination = {};

    createGain() {
      return { gain: { value: 1 }, connect: (node: unknown) => node };
    }

    createMediaElementSource() {
      return { connect: (node: unknown) => node };
    }

    resume() {
      this.state = "running";
      return Promise.resolve();
    }
  }

  /** Turns a player above full volume, as the Preview does in this launch's module, and plays it when `isPlayed`. */
  async function boostAboveFullVolume(isPlayed: boolean): Promise<void> {
    const { playAtVolume, resumeVolumeBoost } =
      await import("../ui/volume_boost");
    const player = document.createElement("video");
    playAtVolume(player, 150);
    if (isPlayed) resumeVolumeBoost(player);
  }

  /** Opens the app anew, where the settings read the Volume Boost as they connect. */
  async function openApp(): Promise<void> {
    const { setInterfaceLanguage } = await import("../i18n");
    await setInterfaceLanguage("zh-Hant-TW");
    const { default: VolumeBoostController } =
      await import("./volume_boost_controller");
    application = Application.start();
    application.register("dialog", DialogController);
    application.register("volume-boost", VolumeBoostController);
    await settle();
  }

  function openSettings(): void {
    document.querySelector<HTMLButtonElement>("#settings")!.click();
  }

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    document.body.innerHTML = `
      <div data-controller="dialog">
        <button id="settings" data-action="dialog#open">設定</button>
        <dialog data-dialog-target="dialog">
          <fieldset data-controller="volume-boost" data-action="dialog:opened@window->volume-boost#showLatency">
            <input type="checkbox" data-volume-boost-target="toggle" data-action="change->volume-boost#choose" />
            <div data-volume-boost-target="latencyRow" hidden><span data-volume-boost-target="latency"></span></div>
            <div data-volume-boost-target="pendingHint" hidden></div>
          </fieldset>
        </dialog>
      </div>
    `;
  });

  afterEach(() => {
    application.stop();
    vi.unstubAllGlobals();
  });

  // @behavior PV-174
  it("remembers the Volume Boost turned on and says it takes effect after a restart", async () => {
    await openApp();

    toggle().checked = true;
    toggle().dispatchEvent(new Event("change"));

    expect([
      localStorage.getItem("tsuzuri.volume-boost"),
      target("pendingHint").hidden,
    ]).toEqual(["true", false]);
  });

  // @behavior PV-175
  it("shows how late the boosted sound reaches the speakers", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    await openApp();
    await boostAboveFullVolume(true);

    openSettings();

    expect([
      target("latencyRow").hidden,
      target("latency").textContent,
    ]).toEqual([false, "約 30 ms"]);
  });

  // @behavior PV-176
  it("leaves the output latency out before the boost plays", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    await openApp();
    await boostAboveFullVolume(false);

    openSettings();

    expect(target("latencyRow").hidden).toBe(true);
  });
});
