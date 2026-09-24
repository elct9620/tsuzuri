import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";

/** How a translation is batched and repaired, as Rust saves it. */
export interface TranslationSettings {
  batch_size: number;
  retries: number;
  reference_lines: number;
}

export default class TranslationSettingsController extends Controller {
  static targets = ["batchSize", "retries", "referenceLines"];

  declare readonly batchSizeTarget: HTMLInputElement;
  declare readonly retriesTarget: HTMLInputElement;
  declare readonly referenceLinesTarget: HTMLInputElement;

  async connect(): Promise<void> {
    this.show(await invoke<TranslationSettings>("translation_settings"));
  }

  async save(): Promise<void> {
    const settings: TranslationSettings = {
      batch_size: Number(this.batchSizeTarget.value),
      retries: Number(this.retriesTarget.value),
      reference_lines: Number(this.referenceLinesTarget.value),
    };
    this.show(
      await invoke<TranslationSettings>("save_translation_settings", {
        settings,
      }),
    );
  }

  private show(settings: TranslationSettings): void {
    this.batchSizeTarget.value = String(settings.batch_size);
    this.retriesTarget.value = String(settings.retries);
    this.referenceLinesTarget.value = String(settings.reference_lines);
  }
}
