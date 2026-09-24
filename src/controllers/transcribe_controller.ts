import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import type { Segment } from "./transcript_controller";

interface PipelineProgress {
  step: string;
  percent: number;
}

export interface Transcription {
  segments: Segment[];
  audio_seconds: number;
  transcribe_seconds: number;
}

const STEP_LABELS: Record<string, string> = {
  convert: "轉檔",
  transcribe: "轉錄",
};

const MEDIA_EXTENSIONS = ["mp4", "mov", "mkv", "m4a", "mp3", "wav", "flac", "ogg", "opus", "aac"];

export default class TranscribeController extends Controller {
  static targets = ["status"];

  declare readonly statusTarget: HTMLElement;

  private unlisteners: UnlistenFn[] = [];
  private running = false;

  async connect(): Promise<void> {
    this.unlisteners.push(
      await listen<PipelineProgress>("pipeline-progress", ({ payload }) => {
        if (this.running) this.statusTarget.textContent = `${STEP_LABELS[payload.step] ?? payload.step} ${payload.percent}%`;
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
      this.statusTarget.textContent = `完成：音檔 ${transcription.audio_seconds.toFixed(1)} 秒，轉錄 ${transcription.transcribe_seconds.toFixed(1)} 秒（RTF ${factor.toFixed(2)}）`;
      this.dispatch("loaded", { target: window, detail: transcription });
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
