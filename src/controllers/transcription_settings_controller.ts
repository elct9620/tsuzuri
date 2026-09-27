import { Controller } from "@hotwired/stimulus";
import {
  saveTranscriptionSettings,
  transcriptionSettings,
  type TranscriptionSettings,
} from "../backend/transcription";
import { t } from "../i18n";
import { notifyFailure } from "../ui/notification";

/** The general Transcription Settings, the default of every Project. */
export default class TranscriptionSettingsController extends Controller {
  static targets = ["vad", "nonSpeechSuppressed", "contextCarried"];

  declare readonly vadTarget: HTMLInputElement;
  declare readonly nonSpeechSuppressedTarget: HTMLInputElement;
  declare readonly contextCarriedTarget: HTMLInputElement;

  async connect(): Promise<void> {
    try {
      this.show(await transcriptionSettings());
    } catch (error) {
      notifyFailure(t("settings.unreadable"), error);
    }
  }

  async save(): Promise<void> {
    const settings: TranscriptionSettings = {
      has_vad: this.vadTarget.checked,
      is_non_speech_suppressed: this.nonSpeechSuppressedTarget.checked,
      is_context_carried: this.contextCarriedTarget.checked,
    };
    try {
      this.show(await saveTranscriptionSettings(settings));
    } catch (error) {
      notifyFailure(t("settings.notSaved"), error);
    }
  }

  private show(settings: TranscriptionSettings): void {
    this.vadTarget.checked = settings.has_vad;
    this.nonSpeechSuppressedTarget.checked = settings.is_non_speech_suppressed;
    this.contextCarriedTarget.checked = settings.is_context_carried;
  }
}
