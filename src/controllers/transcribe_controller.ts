import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { describePhases, followProgress, type PhaseTiming } from "../progress";
import type { Segment } from "./transcript_controller";
import { translateSegments } from "./translate_controller";

export interface Transcription {
  segments: Segment[];
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
  static targets = ["status", "translate", "language", "bar"];

  declare readonly statusTarget: HTMLElement;
  /** Whether to translate the Transcript once transcribed. */
  declare readonly translateTarget: HTMLInputElement;
  declare readonly hasTranslateTarget: boolean;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly barTarget: HTMLProgressElement;
  declare readonly hasBarTarget: boolean;

  private unlisteners: UnlistenFn[] = [];
  private running = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await followProgress(this.statusTarget, this.bar(), () => this.running),
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
    if (this.running) return;
    this.running = true;
    this.statusTarget.textContent = "準備中";
    try {
      const transcription = await invoke<Transcription>("transcribe", { path });
      const factor =
        transcription.transcribe_seconds / transcription.audio_seconds;
      const lines = [
        `完成：音檔 ${transcription.audio_seconds.toFixed(1)} 秒，轉錄 ${transcription.transcribe_seconds.toFixed(1)} 秒（RTF ${factor.toFixed(2)}）`,
        `轉錄：${describePhases(transcription.phases)}`,
      ];
      this.dispatch("loaded", { target: window, detail: transcription });
      if (this.hasTranslateTarget && this.translateTarget.checked) {
        const translation = await translateSegments(
          transcription.segments,
          this.languageTarget.value,
        );
        this.dispatch("loaded", {
          target: window,
          detail: { segments: translation.segments },
        });
        lines.push(`翻譯：${describePhases(translation.phases)}`);
      }
      this.statusTarget.textContent = lines.join("\n");
    } catch (error) {
      this.statusTarget.textContent = `失敗：${String(error)}`;
    } finally {
      this.running = false;
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
