import { Controller } from "@hotwired/stimulus";
import {
  saveTranslationSettings,
  translationSettings,
  type TranslationSettings,
} from "../backend/translation";

export default class TranslationSettingsController extends Controller {
  static targets = ["batchSize", "retries", "referenceLines"];

  declare readonly batchSizeTarget: HTMLInputElement;
  declare readonly retriesTarget: HTMLInputElement;
  declare readonly referenceLinesTarget: HTMLInputElement;

  async connect(): Promise<void> {
    this.show(await translationSettings());
  }

  async save(): Promise<void> {
    const settings: TranslationSettings = {
      batch_size: Number(this.batchSizeTarget.value),
      retries: Number(this.retriesTarget.value),
      reference_lines: Number(this.referenceLinesTarget.value),
    };
    this.show(await saveTranslationSettings(settings));
  }

  private show(settings: TranslationSettings): void {
    this.batchSizeTarget.value = String(settings.batch_size);
    this.retriesTarget.value = String(settings.retries);
    this.referenceLinesTarget.value = String(settings.reference_lines);
  }
}
