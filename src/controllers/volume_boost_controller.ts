import { Controller } from "@hotwired/stimulus";

import { t } from "../i18n";
import {
  chooseVolumeBoost,
  isVolumeBoostOn,
  outputLatencyMs,
} from "../ui/volume_boost";

/** The Volume Boost in the settings: turned on or off for the next launch, and how late its sound reaches the speakers. */
export default class VolumeBoostController extends Controller {
  static targets = ["toggle", "pendingHint", "latencyRow", "latency"];

  declare readonly toggleTarget: HTMLInputElement;
  /** Says the choice takes effect after a restart, while it differs from this launch's. */
  declare readonly pendingHintTarget: HTMLElement;
  /** Shown once the Preview has played through Web Audio. */
  declare readonly latencyRowTarget: HTMLElement;
  declare readonly latencyTarget: HTMLElement;

  /** The Volume Boost the Preview opened with in this launch. */
  private readonly isBoostOnNow = isVolumeBoostOn();

  connect(): void {
    this.toggleTarget.checked = this.isBoostOnNow;
    this.showPending();
    this.showLatency();
  }

  choose(): void {
    chooseVolumeBoost(this.toggleTarget.checked);
    this.showPending();
  }

  showLatency(): void {
    const latency = outputLatencyMs();
    this.latencyRowTarget.hidden = latency === null;
    this.latencyTarget.textContent = t("settings.latencyMs", {
      ms: latency ?? 0,
    });
  }

  private showPending(): void {
    const isBoostOnNext = this.toggleTarget.checked;
    this.pendingHintTarget.hidden = isBoostOnNext === this.isBoostOnNow;
    this.pendingHintTarget.textContent = t(
      isBoostOnNext
        ? "settings.volumeBoostOnAfterRestart"
        : "settings.volumeBoostOffAfterRestart",
    );
  }
}
