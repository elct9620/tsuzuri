import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { listenProgress } from "../progress";
import type { Segment } from "./transcript_controller";
import { translateSegments } from "./translate_controller";

export interface Transcription {
  segments: Segment[];
  audio_seconds: number;
  transcribe_seconds: number;
}

const MEDIA_EXTENSIONS = ["mp4", "mov", "mkv", "m4a", "mp3", "wav", "flac", "ogg", "opus", "aac"];

export default class TranscribeController extends Controller {
  static targets = ["status", "language"];
  static values = { translate: Boolean };

  declare readonly statusTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;
  declare readonly translateValue: boolean;

  private unlisteners: UnlistenFn[] = [];
  private running = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await listenProgress((line) => {
        if (this.running) this.statusTarget.textContent = line;
      }),
      await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === "drop" && !this.isHidden() && payload.paths.length > 0) {
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
      const factor = transcription.transcribe_seconds / transcription.audio_seconds;
      const summary = `音檔 ${transcription.audio_seconds.toFixed(1)} 秒，轉錄 ${transcription.transcribe_seconds.toFixed(1)} 秒（RTF ${factor.toFixed(2)}）`;
      this.dispatch("loaded", { target: window, detail: transcription });
      if (this.translateValue) {
        const translated = await translateSegments(transcription.segments, this.languageTarget.value);
        this.dispatch("loaded", { target: window, detail: { segments: translated } });
      }
      this.statusTarget.textContent = `完成：${summary}`;
    } catch (error) {
      this.statusTarget.textContent = `失敗：${String(error)}`;
    } finally {
      this.running = false;
    }
  }

  private isHidden(): boolean {
    return this.element.closest("[hidden]") !== null;
  }
}
