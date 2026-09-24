import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { failureMessage } from "../failure";
import { t } from "../i18n";
import { phasesSummary, followProgress, type PhaseTiming } from "../progress";
import { translateProject } from "./translate_controller";

export interface Transcription {
  audio_seconds: number;
  transcribe_seconds: number;
  phases: PhaseTiming[];
}

const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "m4a",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "aac",
];

export default class TranscribeController extends Controller {
  static targets = [
    "status",
    "language",
    "translate",
    "translationLanguage",
    "bar",
  ];

  declare readonly statusTarget: HTMLElement;
  /** Whether to translate the Transcript once transcribed. */
  declare readonly translateTarget: HTMLInputElement;
  declare readonly hasTranslateTarget: boolean;
  /** The Language spoken in the media file. */
  declare readonly languageTarget: HTMLSelectElement;
  /** The Language to translate into once transcribed. */
  declare readonly translationLanguageTarget: HTMLSelectElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;

  private unlisteners: UnlistenFn[] = [];
  private isRunning = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await followProgress(this.statusTarget, this.bar(), () => this.isRunning),
      await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (
          payload.type === "drop" &&
          !this.isHidden() &&
          payload.paths.length > 0
        ) {
          void this.transcribe(payload.paths[0]);
        }
      }),
    );
  }

  disconnect(): void {
    for (const unlisten of this.unlisteners) unlisten();
    this.unlisteners = [];
  }

  async choose(): Promise<void> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }],
    });
    if (path !== null) await this.transcribe(path);
  }

  async transcribe(path: string): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.statusTarget.textContent = t("work.preparing");
    try {
      const transcription = await invoke<Transcription>("transcribe", {
        path,
        language: this.languageTarget.value,
      });
      const factor =
        transcription.transcribe_seconds / transcription.audio_seconds;
      const lines = [
        t("transcribe.done", {
          audio: transcription.audio_seconds.toFixed(1),
          seconds: transcription.transcribe_seconds.toFixed(1),
          factor: factor.toFixed(2),
        }),
        t("transcribe.transcribePhases", {
          phases: phasesSummary(transcription.phases),
        }),
      ];
      if (this.hasTranslateTarget && this.translateTarget.checked) {
        const translation = await translateProject(
          this.languageTarget.value,
          this.translationLanguageTarget.value,
        );
        lines.push(
          t("transcribe.translatePhases", {
            phases: phasesSummary(translation.phases),
          }),
        );
      }
      this.statusTarget.textContent = lines.join("\n");
      this.dispatch("finished");
    } catch (error) {
      this.statusTarget.textContent = t("work.failed", {
        reason: failureMessage(error),
      });
    } finally {
      this.isRunning = false;
      this.bar()?.setAttribute("hidden", "");
    }
  }

  private bar(): HTMLProgressElement | undefined {
    return this.hasBarTarget ? this.barTarget : undefined;
  }

  private isHidden(): boolean {
    return this.element.closest("[hidden]") !== null;
  }
}
