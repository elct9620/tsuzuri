import { Controller } from "@hotwired/stimulus";
import {
  saveTranslationSettings,
  translationSettings,
  type TranslationSettings,
} from "../backend/translation";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

export default class TranslationSettingsController extends Controller {
  static targets = [
    "batchSize",
    "retries",
    "referenceLines",
    "residentLlama",
    "modelKeepSeconds",
  ];

  declare readonly batchSizeTarget: HTMLInputElement;
  declare readonly retriesTarget: HTMLInputElement;
  declare readonly referenceLinesTarget: HTMLInputElement;
  declare readonly residentLlamaTarget: HTMLInputElement;
  declare readonly modelKeepSecondsTarget: HTMLInputElement;

  async connect(): Promise<void> {
    try {
      this.show(await translationSettings());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  }

  async save(): Promise<void> {
    const settings: TranslationSettings = {
      batch_size: Number(this.batchSizeTarget.value),
      retries: Number(this.retriesTarget.value),
      reference_lines: Number(this.referenceLinesTarget.value),
      has_resident_llama: this.residentLlamaTarget.checked,
      model_keep_seconds: Number(this.modelKeepSecondsTarget.value),
    };
    try {
      this.show(await saveTranslationSettings(settings));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  private show(settings: TranslationSettings): void {
    this.batchSizeTarget.value = String(settings.batch_size);
    this.retriesTarget.value = String(settings.retries);
    this.referenceLinesTarget.value = String(settings.reference_lines);
    this.residentLlamaTarget.checked = settings.has_resident_llama;
    // The Model is only kept by the Resident llama-server.
    this.modelKeepSecondsTarget.disabled = !settings.has_resident_llama;
    this.modelKeepSecondsTarget.value = String(settings.model_keep_seconds);
  }
}
