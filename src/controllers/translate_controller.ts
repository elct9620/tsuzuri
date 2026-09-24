import { Controller } from "@hotwired/stimulus";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { listenProgress } from "../progress";
import type { Segment } from "./transcript_controller";

interface Translation {
  segments: Segment[];
}

export async function translateSegments(
  segments: Segment[],
  target: string,
): Promise<Segment[]> {
  const translation = await invoke<Translation>("translate", {
    segments,
    target,
  });
  return translation.segments;
}

export default class TranslateController extends Controller {
  static targets = ["status", "language"];

  declare readonly statusTarget: HTMLElement;
  declare readonly languageTarget: HTMLSelectElement;

  private unlisten?: UnlistenFn;
  private running = false;

  async connect(): Promise<void> {
    this.unlisten = await listenProgress((line) => {
      if (this.running) this.statusTarget.textContent = line;
    });
  }

  disconnect(): void {
    this.unlisten?.();
  }

  async choose(): Promise<void> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SRT", extensions: ["srt"] }],
    });
    if (path !== null) await this.translate(path);
  }

  async translate(path: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.statusTarget.textContent = "準備中";
    try {
      const segments = await invoke<Segment[]>("open_srt", { path });
      this.dispatch("loaded", { target: window, detail: { segments } });
      const translated = await translateSegments(
        segments,
        this.languageTarget.value,
      );
      this.dispatch("loaded", {
        target: window,
        detail: { segments: translated },
      });
      this.statusTarget.textContent = "完成";
    } catch (error) {
      this.statusTarget.textContent = `失敗：${String(error)}`;
    } finally {
      this.running = false;
    }
  }
}
